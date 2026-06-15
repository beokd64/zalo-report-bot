const { google } = require("googleapis");
const axios = require("axios");

let driveClient = null;

async function getDriveClient() {
  if (driveClient) return driveClient;

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  const authClient = await auth.getClient();
  driveClient = google.drive({ version: "v3", auth: authClient });
  return driveClient;
}

// Find or create a subfolder named after the user inside the root folder
async function getOrCreateUserFolder(drive, userName) {
  const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const safeName = userName.replace(/['"\\/]/g, "_");

  const res = await drive.files.list({
    q: `'${rootFolderId}' in parents and name='${safeName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id, name)",
  });

  if (res.data.files.length > 0) return res.data.files[0].id;

  const folder = await drive.files.create({
    requestBody: {
      name: safeName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [rootFolderId],
    },
    fields: "id",
  });
  return folder.data.id;
}

// Download a file from a URL (e.g. Zalo CDN) and upload it to the user's Drive folder
// Returns a shareable webViewLink
async function uploadFileFromUrl({ fileUrl, fileName, userName }) {
  const drive = await getDriveClient();
  const userFolderId = await getOrCreateUserFolder(drive, userName);

  const response = await axios.get(fileUrl, { responseType: "stream" });

  const file = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [userFolderId],
    },
    media: {
      mimeType: response.headers["content-type"] || "application/octet-stream",
      body: response.data,
    },
    fields: "id, webViewLink",
  });

  // Make the file viewable by anyone with the link
  await drive.permissions.create({
    fileId: file.data.id,
    requestBody: { role: "reader", type: "anyone" },
  });

  return file.data.webViewLink;
}

module.exports = { uploadFileFromUrl };
