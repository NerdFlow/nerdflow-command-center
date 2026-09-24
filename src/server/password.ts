import bcrypt from "bcryptjs";

export const MIN_PASSWORD_LENGTH = 8;

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export function generateTempPassword(): string {
  // Readable-ish random password: word-word-4digits, easy to relay verbally or by chat.
  const words = ["orbit", "cedar", "flint", "raven", "delta", "amber", "coral", "birch", "quartz", "ember"];
  const pick = () => words[Math.floor(Math.random() * words.length)];
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `${pick()}-${pick()}-${digits}`;
}
