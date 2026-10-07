import fallbackHtml from "../../public/service-unavailable.html";
import { handleRequest } from "./handler.mjs";

const worker = {
  fetch(request) {
    return handleRequest(request, {
      fallbackHtml,
      // A Cloudflare Route fetches its DNS-configured origin using the same URL
      // and Host. Manual redirects preserve Location and avoid replaying secrets.
      fetchOrigin: (originalRequest) => fetch(originalRequest, { redirect: "manual" }),
    });
  },
};

export default worker;
