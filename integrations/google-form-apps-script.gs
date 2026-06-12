const BACKEND_URL_FALLBACK =
  "https://id-generator-backend-jet.vercel.app/api/google-form/digival-card";

// Update these values so they exactly match your Google Form question titles
// or the linked response sheet column headers.
const FIELD_TITLES = {
  name: "Name",
  employeeId: "Employee ID",
  bloodGroup: "Blood Group",
  phone: "Phone Number",
  email: "Email Address",
  photo: "Photo"
};

function onFormSubmit(e) {
  if (!e) {
    throw new Error("Run this function from an installable form-submit trigger.");
  }

  const secret = getScriptSetting_("WEBHOOK_SECRET", "");
  if (!secret) {
    throw new Error("Set WEBHOOK_SECRET in Apps Script project settings.");
  }

  const photoFile = getUploadedFile_(e, FIELD_TITLES.photo);
  const photoBlob = photoFile.getBlob();

  const payload = {
    name: getAnswer_(e, FIELD_TITLES.name),
    employeeId: getAnswer_(e, FIELD_TITLES.employeeId),
    bloodGroup: getAnswer_(e, FIELD_TITLES.bloodGroup),
    phone: getAnswer_(e, FIELD_TITLES.phone),
    email: getAnswer_(e, FIELD_TITLES.email),
    photoBase64: Utilities.base64Encode(photoBlob.getBytes()),
    photoMimeType: photoBlob.getContentType(),
    submissionId: getSubmissionId_(e)
  };

  const url = getScriptSetting_("BACKEND_URL", BACKEND_URL_FALLBACK);
  const response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: {
      "x-webhook-secret": secret
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  const body = response.getContentText();

  if (status < 200 || status >= 300) {
    throw new Error("Backend request failed with HTTP " + status + ": " + body);
  }

  return body;
}

function getScriptSetting_(key, fallback) {
  return (
    PropertiesService.getScriptProperties().getProperty(key) ||
    fallback
  );
}

function getAnswer_(e, title) {
  const fromResponse = getAnswerFromFormResponse_(e, title);
  if (fromResponse) return fromResponse;

  const namedValues = e.namedValues || {};
  const value = namedValues[title];

  if (Array.isArray(value)) {
    return String(value[0] || "").trim();
  }

  return String(value || "").trim();
}

function getAnswerFromFormResponse_(e, title) {
  if (!e.response || !e.response.getItemResponses) return "";

  const itemResponses = e.response.getItemResponses();

  for (let i = 0; i < itemResponses.length; i += 1) {
    const itemResponse = itemResponses[i];
    const itemTitle = itemResponse.getItem().getTitle();

    if (itemTitle === title) {
      const response = itemResponse.getResponse();

      if (Array.isArray(response)) {
        return String(response[0] || "").trim();
      }

      return String(response || "").trim();
    }
  }

  return "";
}

function getUploadedFile_(e, title) {
  const answer = getAnswer_(e, title);
  const fileId = extractDriveFileId_(answer);

  if (!fileId) {
    throw new Error(
      "Could not read uploaded file for question/column: " + title
    );
  }

  return DriveApp.getFileById(fileId);
}

function extractDriveFileId_(value) {
  const text = String(value || "");

  if (!text) return "";

  const openIdMatch = text.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (openIdMatch) return openIdMatch[1];

  const filePathMatch = text.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (filePathMatch) return filePathMatch[1];

  const genericIdMatch = text.match(/[a-zA-Z0-9_-]{25,}/);
  return genericIdMatch ? genericIdMatch[0] : "";
}

function getSubmissionId_(e) {
  if (e.response && e.response.getId) {
    return e.response.getId();
  }

  if (e.range && e.range.getSheet) {
    const sheet = e.range.getSheet();
    return sheet.getSheetId() + ":" + e.range.getRow();
  }

  const timestamp = getAnswer_(e, "Timestamp");
  return timestamp || String(new Date().getTime());
}
