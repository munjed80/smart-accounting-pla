# Worker Service

**Status: Production (active)**

This is the production background job processor used by `docker-compose.yml`.
It processes documents from Redis Streams and creates draft transactions.

## Relationship to `spark-worker/`

The `spark-worker/` directory contains an alternative processor that adds Apache Spark
(PySpark) support for large-scale OCR invoice processing. It is **not** used in the
default Docker Compose deployment and is intended for optional horizontal scaling scenarios.

Both directories share similar OCR and ledger-prediction logic, but this `worker/`
service is the canonical production service.
