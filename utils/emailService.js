const nodemailer = require("nodemailer");

const createTransporter = () => {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
};

exports.sendIdCardSubmissionEmail = async ({ to, employeeName }) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error("EMAIL_USER or EMAIL_PASS is missing in .env");
  }

  const frontendUrl =
    process.env.FRONTEND_URL ||
    process.env.CLIENT_URL ||
    "http://localhost:5175";
  const cardsPageUrl = `${frontendUrl}/cards`;
  const transporter = createTransporter();

  await transporter.sendMail({
    from: `"DigiVal ID Card" <${process.env.EMAIL_USER}>`,
    to,
    subject: "Your DigiVal ID Card Request Has Been Received",
    html: `
      <div style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;">
        <div style="max-width:620px;margin:0 auto;padding:28px 16px;">
          <div style="background:#ffffff;border-radius:18px;padding:30px;border:1px solid #e5e7eb;box-shadow:0 10px 30px rgba(15,23,42,0.08);">
            <h2 style="margin:0 0 14px;color:#111827;font-size:24px;">
              Hello ${employeeName || "User"},
            </h2>

            <p style="margin:0 0 18px;color:#374151;font-size:15px;line-height:1.7;">
              Your DigiVal ID card details have been successfully submitted and saved in our system.
            </p>

            <div style="background:#eff6ff;border-left:5px solid #2196f3;padding:16px 18px;border-radius:12px;margin:22px 0;">
              <p style="margin:0;color:#1e3a8a;font-size:15px;line-height:1.7;">
                Your ID card has been generated on our website. Please login to your account and open the
                <strong>Generated Cards / Saved Cards</strong> section to view your ID card.
              </p>
            </div>

            <p style="margin:0 0 18px;color:#374151;font-size:15px;line-height:1.7;">
              You can review your card details, view the generated ID card, and download it from the website whenever required.
            </p>

            <div style="text-align:center;margin:28px 0;">
              <a href="${cardsPageUrl}"
                 style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:13px 24px;border-radius:999px;font-size:15px;font-weight:700;">
                Login & View ID Card
              </a>
            </div>

            <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.6;">
              If the button does not work, please login to the DigiVal ID Card Generator website and open the Generated Cards section manually.
            </p>

            <hr style="border:none;border-top:1px solid #e5e7eb;margin:26px 0;" />

            <p style="margin:0;color:#111827;font-size:14px;line-height:1.6;">
              Regards,<br/>
              <strong>DigiVal Team</strong>
            </p>
          </div>
        </div>
      </div>
    `,
  });
};
