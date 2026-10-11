/**
 * Built-in Spring Boot starter list.
 *
 * Used only when Spring Initializr cannot be reached, so the wizard can still
 * offer a sensible set of starters offline. The ids match Initializr's own, so a
 * project generated from this list is identical to one generated from live
 * metadata.
 */

/** A starter that can be selected in the dependency picker. */
export interface StarterOption {
  id: string;
  name: string;
  description?: string;
}

/** A named group of starters. */
export interface StarterGroup {
  name: string;
  values: StarterOption[];
}

/** Fallback Spring Boot starters used when Initializr is unreachable. */
export const FALLBACK_BOOT_GROUPS: StarterGroup[] = [
  {
    name: 'Developer Tools',
    values: [
      { id: 'devtools', name: 'Spring Boot DevTools', description: 'Automatic restart and live reload' },
      { id: 'lombok', name: 'Lombok', description: 'Boilerplate reduction' },
      { id: 'configuration-processor', name: 'Spring Configuration Processor', description: 'Metadata for custom properties' },
      { id: 'docker-compose', name: 'Docker Compose Support', description: 'Manage services with Docker Compose' },
    ],
  },
  {
    name: 'Web',
    values: [
      { id: 'web', name: 'Spring Web', description: 'Build web applications with Spring MVC' },
      { id: 'webflux', name: 'Spring Reactive Web', description: 'Reactive web applications with WebFlux' },
      { id: 'graphql', name: 'Spring for GraphQL', description: 'Build GraphQL services' },
    ],
  },
  {
    name: 'Template Engines',
    values: [
      { id: 'thymeleaf', name: 'Thymeleaf', description: 'Server side template engine' },
      { id: 'freemarker', name: 'Apache FreeMarker', description: 'Template engine' },
      { id: 'mustache', name: 'Mustache', description: 'Logic-less templates' },
    ],
  },
  {
    name: 'Security',
    values: [
      { id: 'security', name: 'Spring Security', description: 'Authentication and access control' },
      { id: 'oauth2-client', name: 'OAuth2 Client', description: 'OAuth2 / OIDC login' },
      { id: 'oauth2-resource-server', name: 'OAuth2 Resource Server', description: 'Protect APIs with JWT' },
    ],
  },
  {
    name: 'SQL',
    values: [
      { id: 'data-jpa', name: 'Spring Data JPA', description: 'Persist data with JPA and Hibernate' },
      { id: 'jdbc', name: 'JDBC API', description: 'Plain JDBC access' },
      { id: 'flyway', name: 'Flyway Migration', description: 'Versioned database migrations' },
      { id: 'liquibase', name: 'Liquibase Migration', description: 'Database schema change management' },
      { id: 'h2', name: 'H2 Database', description: 'Embedded in-memory database' },
      { id: 'postgresql', name: 'PostgreSQL Driver', description: 'PostgreSQL JDBC driver' },
      { id: 'mysql', name: 'MySQL Driver', description: 'MySQL JDBC driver' },
    ],
  },
  {
    name: 'NoSQL',
    values: [
      { id: 'data-redis', name: 'Spring Data Redis', description: 'Redis key-value store' },
      { id: 'data-mongodb', name: 'Spring Data MongoDB', description: 'MongoDB document store' },
      { id: 'elasticsearch', name: 'Elasticsearch Client', description: 'Search and analytics engine' },
    ],
  },
  {
    name: 'Messaging',
    values: [
      { id: 'kafka', name: 'Spring for Apache Kafka', description: 'Publish and consume Kafka messages' },
      { id: 'rabbitmq', name: 'Spring for RabbitMQ', description: 'AMQP messaging' },
      { id: 'amqp', name: 'Spring AMQP', description: 'Advanced Message Queuing Protocol' },
      { id: 'websocket', name: 'WebSocket', description: 'Bidirectional communication' },
    ],
  },
  {
    name: 'I/O',
    values: [
      { id: 'validation', name: 'Validation', description: 'Bean validation with Hibernate Validator' },
      { id: 'batch', name: 'Spring Batch', description: 'Batch processing' },
      { id: 'mail', name: 'Java Mail Sender', description: 'Send email' },
      { id: 'quartz', name: 'Quartz Scheduler', description: 'Schedule jobs' },
      { id: 'cache', name: 'Spring Cache Abstraction', description: 'Caching support' },
    ],
  },
  {
    name: 'Ops',
    values: [
      { id: 'actuator', name: 'Spring Boot Actuator', description: 'Production ready features' },
      { id: 'sbom-cyclone-dx', name: 'CycloneDX SBOM support', description: 'Generate a software bill of materials' },
    ],
  },
  {
    name: 'Observability',
    values: [
      { id: 'prometheus', name: 'Prometheus', description: 'Export metrics to Prometheus' },
      { id: 'zipkin', name: 'Zipkin', description: 'Distributed tracing' },
    ],
  },
  {
    name: 'Testing',
    values: [
      { id: 'testcontainers', name: 'Testcontainers', description: 'Docker containers in tests' },
      { id: 'restdocs', name: 'Spring REST Docs', description: 'Document RESTful services' },
    ],
  },
];

