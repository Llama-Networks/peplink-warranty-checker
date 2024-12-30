/*****************************************************************************
 * index.js
 *
 * 1. Read credentials from .env (Peplink + SMTP)
 * 2. Fetch a Bearer token (client_credentials) from Peplink
 * 3. Fetch orgs, then devices, filter expiry <= 90 days
 * 4. Generate CSV
 * 5. Send CSV via nodemailer, using SMTP credentials in .env
 *****************************************************************************/

require('dotenv').config();

// If on Node <18, uncomment and install node-fetch:
// const fetch = require('node-fetch');
const nodemailer = require('nodemailer');

/**
 * Get a Bearer token via client_credentials from Peplink.
 */
async function getBearerToken() {
  const TOKEN_ENDPOINT = 'https://api.ic.peplink.com/api/oauth2/token';
  const { PEPLINK_CLIENT_ID, PEPLINK_CLIENT_SECRET } = process.env;

  if (!PEPLINK_CLIENT_ID || !PEPLINK_CLIENT_SECRET) {
    throw new Error('Missing PEPLINK_CLIENT_ID or PEPLINK_CLIENT_SECRET in .env');
  }

  const body = new URLSearchParams({
    client_id: PEPLINK_CLIENT_ID,
    client_secret: PEPLINK_CLIENT_SECRET,
    grant_type: 'client_credentials'
  });

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  const rawTokenBody = await response.text();
  if (!response.ok) {
    throw new Error(`Failed to get token: ${response.status} - ${rawTokenBody}`);
  }

  let tokenJson;
  try {
    tokenJson = JSON.parse(rawTokenBody);
  } catch (err) {
    throw new Error('Failed to parse token JSON: ' + err);
  }

  if (!tokenJson.access_token) {
    throw new Error('No access_token in token response');
  }

  return tokenJson.access_token;
}

/**
 * Calculate the number of days (ceil) between date1 and date2.
 */
function diffInDays(date1, date2) {
  const msInDay = 24 * 60 * 60 * 1000;
  return Math.ceil((date1 - date2) / msInDay);
}

async function main() {
  // === 1) Retrieve token
  let token;
  try {
    token = await getBearerToken();
    console.log('Token retrieved successfully:', token);
  } catch (err) {
    console.error('Error retrieving token:', err);
    process.exit(1);
  }

  // === 2) Fetch organizations
  const ORG_ENDPOINT = 'https://api.ic.peplink.com/rest/o';
  let orgData;
  try {
    const orgResponse = await fetch(ORG_ENDPOINT, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const orgRawBody = await orgResponse.text();
    if (!orgResponse.ok) {
      throw new Error(`Failed to fetch orgs: ${orgResponse.status} - ${orgRawBody}`);
    }
    console.log('\nRaw organization response body:', orgRawBody);

    orgData = JSON.parse(orgRawBody);
  } catch (err) {
    console.error('Error fetching organizations:', err);
    process.exit(1);
  }

  // orgData.data should contain the array of orgs
  const orgs = orgData.data;
  if (!Array.isArray(orgs) || orgs.length === 0) {
    console.log('\nNo organizations found or insufficient permissions.');
    return;
  }

  console.log(`\nSuccessfully retrieved ${orgs.length} organization(s).`);

  // === Prepare CSV output
  const csvLines = ['org_name,serial_number,warranty_expiry_date,days_until_expiry,is_expired'];

  // We'll do 90 days from now
  const now = new Date();
  const cutoffDate = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  // === 3) For each org, fetch devices
  for (const org of orgs) {
    const orgId = org.id;
    const orgName = org.name;

    console.log(`\nFetching devices for org ID: ${orgId} | Name: ${orgName}`);

    const DEV_ENDPOINT = `https://api.ic.peplink.com/rest/o/${orgId}/d?includeWarranty=true`;

    let devicesData;
    try {
      const devResponse = await fetch(DEV_ENDPOINT, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const devRawBody = await devResponse.text();
      if (!devResponse.ok) {
        throw new Error(`Failed to fetch devices for org ${orgId}: ${devResponse.status} - ${devRawBody}`);
      }

      console.log(`Raw device response for org ${orgId}:`, devRawBody);

      devicesData = JSON.parse(devRawBody);

    } catch (err) {
      console.error(`Error fetching devices for org ${orgId}:`, err);
      continue;
    }

    const devices = devicesData.data || [];
    if (!Array.isArray(devices) || devices.length === 0) {
      console.log(`No devices found in org ${orgName}.`);
      continue;
    }

    // === 4) Filter warranty <= 90 days, remove hyphens from serial, etc.
    for (const device of devices) {
      // The serial number is in "sn"
      if (!device.sn || !device.expiry_date) {
        continue; // skip if missing data
      }

      // Remove non-alphanumeric
      const serial = device.sn.replace(/[^a-zA-Z0-9]/g, '');

      const expiryDate = new Date(device.expiry_date);
      if (expiryDate <= cutoffDate) {
        const daysLeft = diffInDays(expiryDate, now);
        // Convert device.expired boolean to YES/NO
        const isExpired = device.expired ? 'YES' : 'NO';

        csvLines.push(
          `"${orgName}","${serial}","${device.expiry_date}","${daysLeft}","${isExpired}"`
        );
      }
    }
  }

  // If no lines beyond the header
  if (csvLines.length === 1) {
    console.log('\nNo devices found with warranty expiring within 90 days.');
    // But still email the CSV if you want an empty file – that’s optional.
    await sendEmailWithCSV(csvLines.join('\n'));
  } else {
    // We have data
    const csvContent = csvLines.join('\n');
    console.log('\n==== CSV Output (Devices expiring in <= 90 days) ====');
    console.log(csvContent);

    // === 5) Send email with the CSV
    await sendEmailWithCSV(csvContent);
  }
}

/**
 * Sends an email with the CSV content as an attachment, using nodemailer and .env SMTP settings.
 * The email is sent to process.env.SMTP_TO
 */
async function sendEmailWithCSV(csvContent) {
  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS,
    SMTP_TO,
    SMTP_FROM
  } = process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_TO) {
    console.error('Missing SMTP settings in .env. Cannot send email.');
    return;
  }

  // Create a nodemailer transporter
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: true,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });

  const mailOptions = {
    from: SMTP_FROM || SMTP_USER, // fallback if SMTP_FROM isn't set
    to: SMTP_TO,
    subject: 'Peplink Warranty Expiry Report',
    text: 'Please see attached CSV with devices expiring in <= 90 days.<br><b>Remember</b> that these are only representative of devices we have InControl access to!',
    attachments: [
      {
        filename: 'peplink_ic2_warranty_report.csv',
        content: csvContent
      }
    ]
  };

  try {
    let info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);
  } catch (err) {
    console.error('Error sending email:', err);
  }
}

// Run
main().catch(err => {
  console.error('Unexpected error in main:', err);
  process.exit(1);
});
