const axios = require("axios");

// Submits a response directly to a Google Form via its public formResponse endpoint.
// Requires the form's ID and the entry.XXXXXXXXX field IDs (see README for how to find these).
async function submitToGoogleForm({ name, userId, week, report, notes, fileLinks }) {
  const formId = process.env.GOOGLE_FORM_ID;
  const url = `https://docs.google.com/forms/d/e/${formId}/formResponse`;

  const params = new URLSearchParams();
  params.append(process.env.GOOGLE_FORM_ENTRY_NAME, name);
  if (process.env.GOOGLE_FORM_ENTRY_USERID) {
    params.append(process.env.GOOGLE_FORM_ENTRY_USERID, userId);
  }
  params.append(process.env.GOOGLE_FORM_ENTRY_WEEK, week);
  params.append(process.env.GOOGLE_FORM_ENTRY_REPORT, report);
  params.append(process.env.GOOGLE_FORM_ENTRY_NOTES, notes);
  params.append(
    process.env.GOOGLE_FORM_ENTRY_FILES,
    fileLinks.length ? fileLinks.join("\n") : "No files attached"
  );

  // Google Forms' formResponse endpoint always returns 200 with an HTML page
  // (success or failure both look like 200), so we just confirm the request lands.
  await axios.post(url, params.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    maxRedirects: 5,
  });

  return true;
}

module.exports = { submitToGoogleForm };
