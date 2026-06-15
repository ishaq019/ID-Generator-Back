const BACKEND_URL_FALLBACK =
  "https://accustom-suds-roving.ngrok-free.dev/api/google-form/digival-card";

// Update these values so they exactly match your Google Form question titles
// or the linked response sheet column headers. Arrays allow old/new labels.
const FIELD_TITLES = {
  name: ["Name"],
  employeeId: ["Employee ID"],
  bloodGroup: ["Blood Group"],
  phone: ["Phone Number"],
  email: ["Email Address"],
  photo: ["ID Card Image", "Photo"]
};

function onFormSubmit(e) {
  try {
    if (!e) {
      throw new Error("Run this function from an installable form-submit trigger.");
    }

    const secret = getScriptSetting_("WEBHOOK_SECRET", "");

    if (!secret) {
      throw new Error("Set WEBHOOK_SECRET in Apps Script project settings.");
    }

    const url = getScriptSetting_("BACKEND_URL", BACKEND_URL_FALLBACK);

    if (!url) {
      throw new Error("Set BACKEND_URL in Apps Script project settings.");
    }

    Logger.log("Trigger event keys: " + JSON.stringify(Object.keys(e)));
    Logger.log("Posting to backend URL: " + url);

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

    Logger.log("Payload without image: " + JSON.stringify({
      name: payload.name,
      employeeId: payload.employeeId,
      bloodGroup: payload.bloodGroup,
      phone: payload.phone,
      email: payload.email,
      photoMimeType: payload.photoMimeType,
      submissionId: payload.submissionId
    }));

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

    Logger.log("Backend status: " + status);
    Logger.log("Backend response: " + body);

    if (status < 200 || status >= 300) {
      throw new Error("Backend request failed with HTTP " + status + ": " + body);
    }

    return body;
  } catch (error) {
    Logger.log("Google Form webhook error: " + error.message);
    throw error;
  }
}

function getScriptSetting_(key, fallback) {
  return String(
    PropertiesService.getScriptProperties().getProperty(key) || fallback || ""
  ).trim();
}

function getAnswer_(e, titles) {
  const titleList = normalizeTitles_(titles);

  for (let i = 0; i < titleList.length; i += 1) {
    const title = titleList[i];
    const fromResponse = getAnswerFromFormResponse_(e, title);
    if (fromResponse) return fromResponse;

    const fromNamedValues = getAnswerFromNamedValues_(e, title);
    if (fromNamedValues) return fromNamedValues;
  }

  return "";
}

function getAnswerFromNamedValues_(e, title) {
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
    const itemTitle = String(itemResponse.getItem().getTitle()).trim();

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

function getUploadedFile_(e, titles) {
  const titleList = normalizeTitles_(titles);
  let fileId = "";

  for (let i = 0; i < titleList.length; i += 1) {
    const title = titleList[i];

    // Method 1: Best method for "From form" trigger.
    fileId = getFileIdFromFormResponse_(e, title);

    // Method 2: Works when namedValues contains Drive URL or file ID.
    if (!fileId) {
      const answer = getAnswerFromNamedValues_(e, title);
      fileId = extractDriveFileId_(answer);
    }

    // Method 3: Works for "From spreadsheet" trigger with rich-text link in cell.
    if (!fileId) {
      fileId = getFileIdFromSheetCell_(e, title);
    }

    if (fileId) {
      Logger.log("Resolved uploaded file ID: " + fileId);
      return DriveApp.getFileById(fileId);
    }
  }

  Logger.log("Available namedValues: " + JSON.stringify(e.namedValues || {}));
  throw new Error(
    "Could not read uploaded file for question/column: " + titleList.join(" or ")
  );
}

function getFileIdFromFormResponse_(e, title) {
  if (!e.response || !e.response.getItemResponses) return "";

  const itemResponses = e.response.getItemResponses();

  for (let i = 0; i < itemResponses.length; i += 1) {
    const itemResponse = itemResponses[i];
    const itemTitle = String(itemResponse.getItem().getTitle()).trim();

    if (itemTitle === title) {
      const response = itemResponse.getResponse();

      if (Array.isArray(response)) {
        return extractDriveFileId_(response[0]);
      }

      return extractDriveFileId_(response);
    }
  }

  return "";
}

function getFileIdFromSheetCell_(e, title) {
  if (!e.range || !e.range.getSheet) return "";

  const sheet = e.range.getSheet();
  const row = e.range.getRow();
  const headers = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .map(function (header) {
      return String(header).trim();
    });

  Logger.log("Sheet headers: " + JSON.stringify(headers));

  const columnIndex = headers.indexOf(title);

  if (columnIndex === -1) {
    Logger.log("Column not found for title: " + title);
    return "";
  }

  const cell = sheet.getRange(row, columnIndex + 1);
  const richTextValue = cell.getRichTextValue();

  if (richTextValue) {
    const directLink = richTextValue.getLinkUrl();

    if (directLink) {
      const directFileId = extractDriveFileId_(directLink);
      if (directFileId) return directFileId;
    }

    const runs = richTextValue.getRuns();

    for (let i = 0; i < runs.length; i += 1) {
      const link = runs[i].getLinkUrl();

      if (link) {
        const runFileId = extractDriveFileId_(link);
        if (runFileId) return runFileId;
      }
    }
  }

  const formula = cell.getFormula();
  const fileIdFromFormula = extractDriveFileId_(formula);
  if (fileIdFromFormula) return fileIdFromFormula;

  const displayValue = cell.getDisplayValue();
  const fileIdFromDisplay = extractDriveFileId_(displayValue);
  if (fileIdFromDisplay) return fileIdFromDisplay;

  const rawValue = cell.getValue();
  const fileIdFromRawValue = extractDriveFileId_(rawValue);
  if (fileIdFromRawValue) return fileIdFromRawValue;

  Logger.log("Photo cell display value: " + displayValue);
  Logger.log("Photo cell raw value: " + rawValue);

  return "";
}

function extractDriveFileId_(value) {
  const text = String(value || "").trim();

  if (!text) return "";

  const patterns = [
    /[?&]id=([a-zA-Z0-9_-]{20,})/,
    /\/d\/([a-zA-Z0-9_-]{20,})/,
    /open\?id=([a-zA-Z0-9_-]{20,})/,
    /file\/d\/([a-zA-Z0-9_-]{20,})/,
    /([a-zA-Z0-9_-]{25,})/
  ];

  for (let i = 0; i < patterns.length; i += 1) {
    const match = text.match(patterns[i]);

    if (match) {
      return match[1] || match[0];
    }
  }

  return "";
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

function normalizeTitles_(titles) {
  if (Array.isArray(titles)) {
    return titles
      .map(function (title) {
        return String(title || "").trim();
      })
      .filter(function (title) {
        return Boolean(title);
      });
  }

  return [String(titles || "").trim()].filter(function (title) {
    return Boolean(title);
  });
}
