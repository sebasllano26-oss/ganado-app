export function hasConfirmedEmail(session) {
  const user = session?.user;
  return Boolean(user?.email_confirmed_at || user?.confirmed_at);
}
