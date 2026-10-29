import Constants from "expo-constants";

/**
 * @fileoverview Central API configuration.
 * Ensures the base URL is available and exposes endpoints consistently.
 */

/**
 * Extracts API base URL from Expo config or environment variables.
 * @type {string | undefined}
 */
const { API_BASE_URL } =
  Constants.manifest?.extra || Constants.expoConfig?.extra || {};

/**
 * Throws an error if API_BASE_URL is missing.
 */
if (!API_BASE_URL) {
  throw new Error("Missing API_BASE_URL in environment configuration");
}

/**
 * API configuration object containing baseURL and endpoint paths.
 * @constant
 * @type {{ baseURL: string, endpoints: { baseline: string } }}
 */
const apiConfig = {
  baseURL: API_BASE_URL,
  endpoints: {
    baseline: "/baseline",
    getUser: "/user",
    quiz: "/quiz",
    rewards: "/rewards",
    articles: "/articles",
  },
};

export default apiConfig;
