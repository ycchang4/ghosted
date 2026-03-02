const { authenticate } = require('@google-cloud/local-auth')
const { google } = require('googleapis')
const path = require('path')
const fs = require('fs')

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']
const TOKEN_PATH = path.join(process.cwd(), 'token.json')
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json')

async function authorize() {
    // Check if we already have a token saved
    if (fs.existsSync(TOKEN_PATH)) {
        const token = JSON.parse(fs.readFileSync(TOKEN_PATH))
        const auth = new google.auth.OAuth2()
        auth.setCredentials(token)
        return auth
    }

    // If not, run the OAuth flow
    const auth = await authenticate({
        scopes: SCOPES,
        keyfilePath: CREDENTIALS_PATH,
    })

    // Save the token so we don't have to login every time
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(auth.credentials))
    return auth
}

module.exports = { authorize }

// Test the connection
authorize()
    .then(() => console.log('✅ Gmail authorization successful'))
    .catch(console.error)