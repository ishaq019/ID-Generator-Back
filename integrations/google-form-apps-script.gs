const BACKEND_URL_FALLBACK = "";

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

function authorizeGoogleFormAutomation() {
  const authorizationUrl =
    getScriptSetting_("BACKEND_URL", BACKEND_URL_FALLBACK) ||
    "https://example.com";

  PropertiesService.getScriptProperties().getProperties();
  SpreadsheetApp.getActiveSpreadsheet().getSheets()[0].getLastRow();
  DriveApp.getRootFolder().getName();
  UrlFetchApp.getRequest(authorizationUrl);

  Logger.log(
    "Authorization check completed. Now use the installable spreadsheet form-submit trigger."
  );
}

function onFormSubmit(e) {
  try {
    if (!e || !e.range || !e.range.getSheet) {
      throw new Error(
        "Run this function from an installable spreadsheet form-submit trigger. If Apps Script asks for permissions, run authorizeGoogleFormAutomation once and approve access."
      );
    }

    const secret = getScriptSetting_("WEBHOOK_SECRET", "");

    if (!secret) {
      throw new Error("Set WEBHOOK_SECRET in Apps Script project settings.");
    }

    const url = getScriptSetting_("BACKEND_URL", BACKEND_URL_FALLBACK);

    if (!url) {
      throw new Error("Set BACKEND_URL in Apps Script project settings.");
    }

    const rowData = getSubmittedRowData_(e);
    const photoFileId = getUploadedFileId_(e, rowData, FIELD_TITLES.photo);

    shareUploadedFileWithBackend_(photoFileId);

    const payload = {
      name: getAnswer_(e, rowData, FIELD_TITLES.name),
      employeeId: getAnswer_(e, rowData, FIELD_TITLES.employeeId),
      bloodGroup: getAnswer_(e, rowData, FIELD_TITLES.bloodGroup),
      phone: getAnswer_(e, rowData, FIELD_TITLES.phone),
      email: getAnswer_(e, rowData, FIELD_TITLES.email),
      photoFileId: photoFileId,
      submissionId: getSubmissionId_(e, rowData)
    };

    Logger.log("Posting to backend URL: " + url);
    Logger.log("Payload: " + JSON.stringify(payload));

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
    Logger.log("Google Sheet webhook error: " + error.message);

    if (isAuthorizationError_(error)) {
      Logger.log(
        "Authorization required. In Apps Script, run authorizeGoogleFormAutomation manually once, approve permissions, then submit the Form again."
      );
    }

    throw error;
  }
}

function isAuthorizationError_(error) {
  return /permission|authorization|required permissions/i.test(
    String(error && error.message ? error.message : error)
  );
}

function getScriptSetting_(key, fallback) {
  return String(
    PropertiesService.getScriptProperties().getProperty(key) || fallback || ""
  ).trim();
}

function shareUploadedFileWithBackend_(fileId) {
  const readerEmails = getReaderEmails_();

  if (readerEmails.length === 0) {
    Logger.log(
      "No BACKEND_DRIVE_READER_EMAILS script property set. Skipping file sharing."
    );
    return;
  }

  try {
    const file = DriveApp.getFileById(fileId);

    for (let i = 0; i < readerEmails.length; i += 1) {
      file.addViewer(readerEmails[i]);
      Logger.log(
        "Granted uploaded file read access to backend account: " +
          readerEmails[i]
      );
    }
  } catch (error) {
    throw new Error(
      "Could not grant backend Drive account access to uploaded file " +
        fileId +
        ": " +
        error.message
    );
  }
}

function getReaderEmails_() {
  const value =
    getScriptSetting_("BACKEND_DRIVE_READER_EMAILS", "") ||
    getScriptSetting_("BACKEND_DRIVE_READER_EMAIL", "");

  return value
    .split(",")
    .map(function (email) {
      return String(email || "").trim();
    })
    .filter(function (email) {
      return Boolean(email);
    });
}

function getSubmittedRowData_(e) {
  const sheet = e.range.getSheet();
  const row = e.range.getRow();
  const lastColumn = sheet.getLastColumn();
  const headers = sheet
    .getRange(1, 1, 1, lastColumn)
    .getDisplayValues()[0]
    .map(function (header) {
      return String(header || "").trim();
    });
  const values = sheet
    .getRange(row, 1, 1, lastColumn)
    .getDisplayValues()[0]
    .map(function (value) {
      return String(value || "").trim();
    });
  const byHeader = {};
  const normalizedHeaderMap = {};

  for (let i = 0; i < headers.length; i += 1) {
    if (!headers[i]) continue;

    byHeader[headers[i]] = values[i] || "";
    normalizedHeaderMap[normalizeLookupKey_(headers[i])] = headers[i];
  }

  return {
    sheet: sheet,
    row: row,
    headers: headers,
    values: values,
    byHeader: byHeader,
    normalizedHeaderMap: normalizedHeaderMap
  };
}

function getAnswer_(e, rowData, titles) {
  const titleList = normalizeTitles_(titles);

  for (let i = 0; i < titleList.length; i += 1) {
    const title = titleList[i];
    const fromNamedValues = getAnswerFromNamedValues_(e, title);
    if (fromNamedValues) return fromNamedValues;

    const fromSheetRow = getAnswerFromSheetRow_(rowData, title);
    if (fromSheetRow) return fromSheetRow;
  }

  return "";
}

function getAnswerFromNamedValues_(e, title) {
  const namedValues = e.namedValues || {};

  if (Object.prototype.hasOwnProperty.call(namedValues, title)) {
    return normalizeNamedValue_(namedValues[title]);
  }

  const normalizedTitle = normalizeLookupKey_(title);
  const keys = Object.keys(namedValues);

  for (let i = 0; i < keys.length; i += 1) {
    if (normalizeLookupKey_(keys[i]) === normalizedTitle) {
      return normalizeNamedValue_(namedValues[keys[i]]);
    }
  }

  return "";
}

function getAnswerFromSheetRow_(rowData, title) {
  if (Object.prototype.hasOwnProperty.call(rowData.byHeader, title)) {
    return String(rowData.byHeader[title] || "").trim();
  }

  const actualHeader = rowData.normalizedHeaderMap[normalizeLookupKey_(title)];

  if (actualHeader) {
    return String(rowData.byHeader[actualHeader] || "").trim();
  }

  return "";
}

function normalizeNamedValue_(value) {
  if (Array.isArray(value)) {
    return String(value[0] || "").trim();
  }

  return String(value || "").trim();
}

function getUploadedFileId_(e, rowData, titles) {
  const titleList = normalizeTitles_(titles);

  for (let i = 0; i < titleList.length; i += 1) {
    const title = titleList[i];
    let fileId = extractDriveFileId_(getAnswerFromNamedValues_(e, title));

    if (!fileId) {
      fileId = extractDriveFileId_(getAnswerFromSheetRow_(rowData, title));
    }

    if (!fileId) {
      fileId = getFileIdFromSheetCell_(rowData, title);
    }

    if (fileId) {
      Logger.log("Resolved uploaded file ID: " + fileId);
      return fileId;
    }
  }

  Logger.log("Available namedValues: " + JSON.stringify(e.namedValues || {}));
  Logger.log("Sheet headers: " + JSON.stringify(rowData.headers));

  throw new Error(
    "Could not extract uploaded file ID for column: " + titleList.join(" or ")
  );
}

function getFileIdFromSheetCell_(rowData, title) {
  const columnIndex = getColumnIndex_(rowData, title);

  if (columnIndex === -1) {
    Logger.log("Column not found for title: " + title);
    return "";
  }

  const cell = rowData.sheet.getRange(rowData.row, columnIndex + 1);
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

function getColumnIndex_(rowData, title) {
  for (let i = 0; i < rowData.headers.length; i += 1) {
    if (rowData.headers[i] === title) {
      return i;
    }
  }

  const actualHeader = rowData.normalizedHeaderMap[normalizeLookupKey_(title)];

  if (!actualHeader) {
    return -1;
  }

  return rowData.headers.indexOf(actualHeader);
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

function getSubmissionId_(e, rowData) {
  const spreadsheetId =
    e.source && e.source.getId ? e.source.getId() : "spreadsheet";
  const timestamp = getAnswer_(e, rowData, "Timestamp");

  return [
    spreadsheetId,
    rowData.sheet.getSheetId(),
    rowData.row,
    timestamp
  ]
    .filter(function (part) {
      return Boolean(String(part || "").trim());
    })
    .join(":");
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

function normalizeLookupKey_(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
