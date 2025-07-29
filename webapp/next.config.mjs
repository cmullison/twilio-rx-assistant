/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;

// Initialize OpenNext for development
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
