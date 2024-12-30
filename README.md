Node.js Peplink Warranty Checker (No UI)
========================================

This project is a simple Node.js script that queries **Peplink InControl 2** for organizations, devices, and their warranty expiry dates. It looks for warranties expiring within 90 days, generates a CSV report, and emails the CSV using **nodemailer** with SMTP credentials stored in your `.env` file.

* * *

Purpose & Overview
------------------

The core script (`index.js`) performs these steps:

1.  **Read credentials** from `.env` (Peplink API credentials + SMTP settings).
2.  **Fetch a Bearer token** from Peplink InControl 2 using _client\_credentials_ flow.
3.  **Retrieve organizations** and devices from InControl 2, filtering devices whose expiry <= 90 days (including already expired devices).
4.  **Generate a CSV** of the filtered devices (org, serial, expiry date, days to expiry, etc.).
5.  **Send the CSV** via email (nodemailer), using SMTP configuration from `.env`.

* * *

Installation
------------

1.  **Clone or copy** the script (`index.js`) into a local folder.
2.  **Install** dependencies:
    
        npm install dotenv nodemailer
    
    If on Node <18, also install `node-fetch` and uncomment relevant lines.
3.  **Create a .env** file in the same folder, with your API credentials, SMTP info, and target email. See sample below.

* * *

Sample `.env`
-------------

    # Peplink OAuth2 credentials
    PEPLINK_CLIENT_ID=your_peplink_client_id
    PEPLINK_CLIENT_SECRET=your_peplink_client_secret
    
    # SMTP settings
    SMTP_HOST=smtp.example.com
    SMTP_PORT=465
    SMTP_USER=someone@example.com
    SMTP_PASS="someSecret"
    SMTP_TO=recipient@somewhere.com
    SMTP_FROM="Peplink Warranty "
    

_Note:_ If your SMTP server uses a different port or requires `secure=false` for STARTTLS (port 587), adjust accordingly. Also set `SMTP_TO` to whomever should receive the CSV report.

* * *

Usage
-----

1.  **Run** the script directly:
    
        node index.js
    
    It will:
    *   Retrieve a token from Peplink InControl 2
    *   Fetch orgs and devices, filter those expiring <= 90 days
    *   Generate a CSV
    *   Email the CSV to `SMTP_TO`
2.  You can also schedule it with **cron** or a similar tool to run daily/weekly, automatically emailing updated reports.

* * *


Important Notes
---------------

*   **Security of .env**: Ensure your `.env` is _not_ publicly exposed (e.g., store it outside any web root, or use access rules to forbid downloads).
*   **API Permissions**: Make sure your Peplink token has permission to read orgs/devices in InControl 2.
*   **SMTP Auth**: If using Gmail or other providers, ensure you allow app passwords or less-secure app access, if required.

* * *

License
-------

This script is released under the **AGPL 3.0** license. See `LICENSE` for the full text.
