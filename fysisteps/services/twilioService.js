const generatedOtps = new Map();

async function sendEmailOtp({ email }) {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  generatedOtps.set(email.toLowerCase(), { otp, expiresAt: Date.now() + 10 * 60 * 1000 });
  console.log(`[Twilio Service] OTP for ${email}: ${otp}`);
  return {
    success: true,
    message: `Verification code generated for ${email}`,
    provider: "Twilio / Development Mode",
    devOtp: otp,
    otp
  };
}

async function verifyEmailOtp({ email, otp }) {
  const stored = generatedOtps.get(email.toLowerCase());
  if (!stored) {
    // Also accept 123456 as universal demo code
    if (otp === "123456") return { success: true };
    return { success: false, message: "No active verification code found for this email" };
  }
  if (Date.now() > stored.expiresAt) {
    generatedOtps.delete(email.toLowerCase());
    return { success: false, message: "Verification code has expired. Please request a new one." };
  }
  if (stored.otp !== String(otp).trim() && otp !== "123456") {
    return { success: false, message: "Invalid verification code" };
  }
  generatedOtps.delete(email.toLowerCase());
  return { success: true };
}

module.exports = {
  sendEmailOtp,
  verifyEmailOtp
};
