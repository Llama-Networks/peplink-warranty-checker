# Peplink IC2 Warranty Checker

This tool will use your InControl2 credentials to fetch a list of all organization you have access to, list all devices in those organizations, and report any devices that are expired, or will be expired in 90 days or less.

After the data is fetched, it is compiled into a .csv file and attached to an email sent to the address specified in the .env file.


## .env Parameters

#### All parameters are required for script operation.

```http
PEPLINK_CLIENT_ID=
PEPLINK_CLIENT_SECRET=
SMTP_HOST=
SMTP_PORT=465
SMTP_USER=
SMTP_PASS=
SMTP_TO=
```
