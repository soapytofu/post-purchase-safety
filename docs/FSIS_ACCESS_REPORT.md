# USDA FSIS API access report

**Prepared:** September 23, 2026

**Intended recipient:** `fsis.webmaster@usda.gov`
**Status:** Draft—not sent

## Subject

Public FSIS Recall API and RSS endpoints returning Akamai 403 responses

## Message

Hello FSIS Webmaster,

I am developing SafeKeep, a consumer-facing safety-notice tool that uses official government sources. The public FSIS Recall API documentation lists this GET endpoint:

`https://www.fsis.usda.gov/fsis/api/recall/v/1`

On September 23, 2026, requests from our development environment consistently returned HTTP 403 from `AkamaiGHost`. The same occurred for the documented/current recall RSS endpoint:

`https://www.fsis.usda.gov/fsis-content/rss/recalls.xml`

We tested HTTPS GET requests with `Accept: application/json` or RSS/XML accept headers and an identifying user agent. Query-string and trailing-slash variations produced the same result. The response included `Access-Control-Allow-Origin: *`, but the edge returned an HTML “Access Denied” response before application content.

Could you confirm:

1. whether these endpoints remain publicly supported;
2. whether server-to-server clients require a particular user agent, header, registration, or allowlisting process;
3. whether there is a preferred current endpoint for machine-readable recalls and public health alerts; and
4. any rate limits or acceptable-use guidance we should follow?

The application identifies itself as:

`SafeKeep/0.4 (+https://github.com/soapytofu/post-purchase-safety)`

We currently preserve older successful data and use the official CDC food-safety RSS relay as a visibly partial fallback rather than treating incomplete coverage as current.

Thank you.

## Evidence retained for follow-up

- HTTP status: `403`
- Edge server: `AkamaiGHost`
- Affected API path: `/fsis/api/recall/v/1`
- Affected RSS path: `/fsis-content/rss/recalls.xml`
- Successful government fallback: `https://www2c.cdc.gov/podcasts/createrss.asp?c=146`

Before sending, reproduce the request from the production host and add its timestamp, region, outbound IP if appropriate, and Akamai reference identifier.
