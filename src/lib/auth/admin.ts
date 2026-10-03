/** The former admin interface is retired, including previously signed sessions. */
export async function getIsAdmin(): Promise<boolean> {
  return false;
}
