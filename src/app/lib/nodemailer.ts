import nodemailer from "nodemailer";
import config from "../config/index.js";

export const transporter = nodemailer.createTransport({
	service: "gmail",
	auth: {
		user: config.smtp_user.trim(),
		pass: config.smtp_password.replace(/\s/g, ""),
	},
});
