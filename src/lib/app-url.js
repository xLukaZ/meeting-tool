export function getAppUrl() {
  return (process.env.APP_URL || "http://localhost:6666").replace(/\/$/, "");
}

export function absoluteUrl(path) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getAppUrl()}${normalizedPath}`;
}
