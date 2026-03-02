const { authenticate } = require('@google-cloud/local-auth')
const { google } = require('googleapis')
const path = require('path')
const fs = require('fs')

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']
const TOKEN_PATH = path.join(process.cwd(), 'token.json')
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json')

async function authorize() {
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH))
    const { client_id, client_secret, redirect_uris } = credentials.installed

    // Always create OUR OAuth2 client with credentials attached
    const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0])

    if (fs.existsSync(TOKEN_PATH)) {
        const token = JSON.parse(fs.readFileSync(TOKEN_PATH))
        auth.setCredentials(token)
        return auth
    }

    // No token yet — use authenticate() just to get the token
    const tempAuth = await authenticate({
        scopes: SCOPES,
        keyfilePath: CREDENTIALS_PATH,
    })

    // Transfer credentials to OUR client (never return tempAuth directly)
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tempAuth.credentials))
    auth.setCredentials(tempAuth.credentials)
    return auth
}

module.exports = { authorize }

// Test the connection
authorize()
    .then(() => console.log('✅ Gmail authorization successful'))
    .catch(console.error)