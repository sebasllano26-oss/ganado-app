export function hasConfirmedEmail(session) {
  const user = session?.user;
  return Boolean(user?.email_confirmed_at || user?.confirmed_at);
}

export function canEnterAfterSignup(result) {
  return hasConfirmedEmail(result?.data?.session);
}
