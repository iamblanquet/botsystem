import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { adminConfig, SESSION_COOKIE, sessionUser, safeReturnPath } from './admin-security.mjs';

// Never trust the preview's oai-authenticated-* headers in a public Node deployment.
export async function getChatGPTUser() {
  const config = adminConfig();
  if (!config) return null;
  return sessionUser((await cookies()).get(SESSION_COOKIE)?.value, config);
}
export async function requireChatGPTUser(returnTo: string) {
  const user = await getChatGPTUser();
  if (user) return user;
  redirect(chatGPTSignInPath(returnTo));
}
export function chatGPTSignInPath(returnTo = '/') { return `/login?return_to=${encodeURIComponent(safeReturnPath(returnTo))}`; }
export function chatGPTSignOutPath(returnTo = '/') { return `/signout-with-chatgpt?return_to=${encodeURIComponent(safeReturnPath(returnTo))}`; }
