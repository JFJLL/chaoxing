/**
 * Client-safe display helpers. This module must stay free of server-only
 * imports (db, crypto, prisma) so client components can import it directly.
 */
export function maskPhone(phone: string): string {
  if (phone.length < 7) return phone;
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}
