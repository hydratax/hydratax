Build a production-ready, UK-compliant tax SaaS backend and frontend architecture that strictly satisfies HMRC Developer Hub and API specifications. Implement the following components:

1. HMRC OAuth2 & Token Manager:

- Implement a secure OAuth2 flow integrating with the HMRC Developer Hub (Sandbox and Production endpoints).

- Create a service to automatically handle access token exchanges, secure token refreshing, and token encryption at rest using AES-256.

2. Mandatory Fraud Prevention Header Service:

- Create a middleware utility that attaches all mandatory HMRC Fraud Prevention Headers to every outgoing API request.

- Ensure headers dynamically capture user-client device metadata strictly on request time without caching, including:

  * Gov-Client-Connection-Method (e.g., "WEB_APP_VIA_SERVER")

  * Gov-Client-Browser-JS-User-Agent, Gov-Client-Timezone, Gov-Client-Screens, Gov-Client-Window-Size

  * Gov-Client-Local-IPs and Gov-Client-Local-IPs-Timestamp

  * Gov-Vendor-Version, Gov-Vendor-License-IDs, and Gov-Vendor-Public-IP

- Ensure requests failing to include complete fraud prevention metadata are blocked locally before hitting the HMRC gateway.

3. Strict Digital Record-Keeping & Integer Currency Engine:

- Handle all currency processing and tax computations in integer pence (storing £1,000.00 as 100000) using strict TypeScript types to eliminate floating-point arithmetic errors.

- Build a Zod validation engine that enforces statutory digital record structures and validates inputs against required HMRC rules prior to payload generation.

4. Immutable Audit Logging:

- Implement an audit logging middleware that records every financial modification, submission payload construction, and response code returned from HMRC APIs (e.g., handling VRR or business error codes) into an immutable database table.

5. Secure Environment Configuration:

- Strictly separate Sandbox and Production base URIs using environment variables, ensuring no sandbox keys or mock gateways bleed into production routes.
