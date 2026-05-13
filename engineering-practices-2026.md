# Engineering Practices Guide — 2026 Edition
**What's Current, What's New, What's Obsolete**

---

## 🟢 Current & Essential Practices

### Code Quality & Review
**Latest approach:** Shift-left code review with AI-assisted analysis
- **Code Review Skill** — Review PRs for security, performance, N+1 queries, injection risks, edge cases
- **Static Analysis** — Integrate linters (ESLint, Ruff, Clippy) into CI/CD as gates, not warnings
- **Test Coverage** — Aim for 80%+ coverage on critical paths; mutation testing for edge case validation

**Tools:** GitHub Actions, SonarQube, Codecov, Snyk

---

### Architecture & Design Decisions
**Current best practice:** Document decisions as ADRs (Architecture Decision Records)
- Use the **Architecture Skill** to create ADRs for tech choices (Kafka vs RabbitMQ, SQL vs NoSQL)
- Include explicit trade-off analysis: complexity, cost, scalability, team familiarity
- Review designs against: CAP theorem, scalability targets, operational overhead

**Tools:** ADR templates, system design frameworks (DODAF, C4 model)

---

### Debugging & Troubleshooting
**Best practice:** Structured debugging workflows
- **Debug Skill** — Reproduce → Isolate → Diagnose → Fix
- Use observability stack: structured logging (JSON), distributed tracing, metric collection
- Implement feature flags for safe rollouts and instant rollbacks

**Tools:** Datadog, New Relic, ELK Stack, Jaeger tracing

---

### Testing Strategy
**Current mindset:** Testing is architecture, not afterthought
- **Testing Strategy Skill** — Design test pyramids: many unit tests, fewer integration tests, minimal E2E tests
- Property-based testing (QuickCheck, Hypothesis) for complex logic
- Chaos engineering for distributed systems (Gremlin, Chaos Mesh)

**Coverage by tier:**
- Unit: 70-80% of code
- Integration: 15-20% critical workflows
- E2E: 5-10% user-critical paths

---

### Deployment & Release Management
**Current standard:** Continuous deployment with safety nets
- **Deploy Checklist Skill** — Verify: CI green, approvals met, feature flags ready, rollback plan documented
- Blue-green or canary deployments for zero-downtime releases
- Database migrations: backward-compatible, tested in staging, monitored with kill-switch
- Feature flags: external control over high-risk code paths

**Tools:** GitHub Actions, GitLab CI, ArgoCD, LaunchDarkly

---

### System Design
**Current approach:** Think in terms of requirements, constraints, and trade-offs
- **System Design Skill** → Clarify: scale (QPS, storage), latency SLOs, consistency model (ACID, eventual)
- Design for observability from day one: logging, metrics, traces
- Plan for failure: circuit breakers, timeouts, bulkheads, fallbacks
- Document: APIs, data schemas, deployment architecture, runbooks

**Modern patterns:**
- Event-driven architectures with CDC (Change Data Capture)
- Async-first design for scalability
- CQRS (Command Query Responsibility Segregation) for complex domains
- Strangler fig pattern for monolith → microservices migration

---

### Documentation
**Best practice:** Living documentation, not static PDFs
- **Documentation Skill** — Write runbooks (how to respond to alerts), architecture guides, API specs
- Use markdown in git repos (version-controlled alongside code)
- Include: deployment procedures, disaster recovery, known issues, troubleshooting trees
- Diagrams as code: Mermaid, PlantUML

---

### Incident Response
**Current process:** Structured triage and blameless postmortems
- **Incident Response Skill** — Triage severity, communicate status, write postmortem
- Severity levels: Critical (user impact), High (partial impact), Medium (no user impact), Low (future improvement)
- Postmortem focus: what happened, why it happened, what we'll do differently (never blame)
- Action items: track and verify closure

---

### Tech Debt Management
**Modern approach:** Quantify and prioritize systematically
- **Tech Debt Skill** — Identify debt by category: performance, security, maintainability, testing gaps
- Quantify: cost to fix vs. risk of not fixing
- Reserve 20-30% of sprint capacity for debt paydown
- Don't let tech debt compound — address high-interest items immediately

---

## 🆕 New in 2026: Latest Practices & Tools

### 1. **AI-Assisted Development Workflows**
- Use AI for code review, architecture evaluation, debugging isolation
- GitHub Copilot for boilerplate, but review output carefully
- Use AI to generate test cases and edge case validation
- Leverage for runbook writing and incident response scripting

### 2. **Observability-First Architecture**
- Instrument from day one: structured logging, distributed tracing, metric collection
- Use OpenTelemetry as the standard instrumentation layer
- Real-time alerting: based on SLOs, not just threshold breaches
- Error budgets: track and spend your "allowed" errors intentionally

### 3. **Security by Design (Shift-Left)**
- Threat modeling in architecture phase (STRIDE, attack trees)
- Dependency scanning in CI/CD (Snyk, Dependabot, FOSSA)
- SAST (Static Application Security Testing) gates in pull requests
- Zero-trust networking principles for all services

### 4. **Cost Optimization as a Requirement**
- Track per-feature cloud costs (via cost allocation tags)
- Design for cost: right-sizing, auto-scaling, spot instances
- Regular cost audits: identify wasteful resources, optimize queries
- Include cost in architectural trade-offs (e.g., Kafka vs SQS)

### 5. **Async-First by Default**
- Event-driven APIs (pub/sub, webhooks, SSE) preferred over sync RPCs
- Background job queues (Bull, RQ, Sidekiq) for non-critical work
- CDC (Change Data Capture) for reliable data synchronization
- CQRS for separation of read and write concerns

### 6. **Container & Orchestration Maturity**
- All services containerized (Docker, Podman)
- Kubernetes (K8s) as standard orchestration for prod workloads
- GitOps workflows (FluxCD, ArgoCD) for declarative deployments
- Network policies, pod security standards, RBAC enforced

### 7. **Modern Database Patterns**
- Polyglot persistence: right tool for the job (SQL, NoSQL, cache, search)
- Event sourcing for audit trails and temporal queries
- CQRS + event sourcing for complex domains
- Multi-region databases (CockroachDB, Spanner) for global scale

### 8. **Testing Evolution**
- Contract testing (Pact, Spring Cloud Contract) for service boundaries
- Mutation testing for test quality validation
- Property-based testing (Hypothesis, QuickCheck) for algorithmic correctness
- Chaos engineering for resilience validation in production

### 9. **Monitoring SLOs Instead of Metrics**
- Define user-centric SLOs: availability, latency, error rate
- Error budgets: track "allowed" errors, spend intentionally
- Alert on SLO breaches, not arbitrary thresholds
- Track SLO compliance quarterly for business reporting

### 10. **Infrastructure as Code (IaC) Maturity**
- Terraform/Pulumi as standard for cloud infrastructure
- Everything in Git: environments, configs, secrets (encrypted)
- Terratest or kitchen-terraform for infrastructure testing
- Policy as Code (OPA/Sentinel) for compliance automation

---

## 🔴 Obsolete Practices: Stop Doing These

### 1. **Manual Deployments**
❌ "SSH into prod and run scripts manually"
✅ Use CI/CD pipelines with approval gates; all changes tracked in Git

---

### 2. **Metric-Based Alerting**
❌ "Alert when CPU > 80% or disk usage > 90%"
✅ Alert on SLO breaches: latency p99, error rate, availability

---

### 3. **Monolithic Logging**
❌ Unstructured logs: `echo "User X did Y"`
✅ Structured JSON logging with correlation IDs for trace-ability

---

### 4. **Manual Testing as QA Gate**
❌ "We test everything manually before release"
✅ Automated test suite gates; manual testing for exploratory/UX only

---

### 5. **Secrets in Code**
❌ API keys, DB passwords in .env files or committed to Git
✅ Secrets management system (Vault, AWS Secrets Manager, 1Password)

---

### 6. **Synchronous Microservices**
❌ "Each service calls other services synchronously in a chain"
✅ Event-driven: services publish events, others consume asynchronously

---

### 7. **"Works on My Machine"**
❌ Developers run tests locally; "it worked on my machine"
✅ CI/CD validates all tests in containers matching production

---

### 8. **No Observability**
❌ "We don't log; we debug by reading code"
✅ Comprehensive logging, tracing, metrics from day one

---

### 9. **Post-Incident Root Cause Analysis (RCA)
❌ "Who caused the outage?" (blame-focused)
✅ Blameless postmortem: what happened, why, what we'll improve

---

### 10. **Manual Capacity Planning**
❌ "Let's buy bigger servers when things slow down"
✅ Auto-scaling based on metrics; capacity planning via monitoring trends

---

### 11. **Waterfall-Style Architecture**
❌ "Architect the whole system upfront for 5 years"
✅ Evolutionary architecture: design for change, refactor incrementally

---

### 12. **Testing Without Mocking**
❌ Tests hitting real databases/APIs in test env
✅ Unit tests use mocks; integration tests use containers (testcontainers)

---

### 13. **Storing Passwords Instead of Tokens**
❌ "Users log in with passwords; we store hashes"
✅ SSO/OAuth; passwordless auth (WebAuthn, MagicLinks); short-lived tokens

---

### 14. **Annual Security Audits**
❌ "We'll audit security once a year"
✅ Continuous security: SAST in CI, dependency scanning, threat modeling in design

---

### 15. **Emergency Patches**
❌ "Production is down; we'll patch without testing"
✅ Feature flags + canary deployments: safe rollouts with instant rollback

---

## 🎯 By the Numbers: Engineering Health Metrics

| Metric | 2024 Baseline | 2026 Target |
|--------|---------------|------------|
| **Deployment Frequency** | Weekly | Daily or on-demand |
| **Lead Time for Changes** | 1-2 weeks | < 1 day |
| **Mean Time to Recovery (MTTR)** | 4+ hours | < 15 minutes |
| **Change Failure Rate** | 15-20% | < 5% |
| **Test Coverage** | 40-60% | 80%+ on critical paths |
| **Security Vulnerabilities Found (in prod)** | 10-20/year | < 5/year |
| **Incident Response Time** | 30+ min | < 5 minutes (automated alerts) |

---

## 📋 Skills You Have in Cowork Now

### Engineering Plugin Skills:
1. **`/engineering:code-review`** — Review PRs for security, perf, correctness
2. **`/engineering:debug`** — Structured debugging (reproduce, isolate, diagnose, fix)
3. **`/engineering:system-design`** — Design scalable systems; API & data modeling
4. **`/engineering:architecture`** — Create ADRs; document tech decisions with trade-offs
5. **`/engineering:tech-debt`** — Audit and prioritize refactoring & code health
6. **`/engineering:testing-strategy`** — Design test pyramids and coverage strategies
7. **`/engineering:deploy-checklist`** — Pre-deploy verification (CI, flags, rollback)
8. **`/engineering:incident-response`** — Triage, communicate, write blameless postmortems
9. **`/engineering:standup`** — Summarize commits, PRs, blockers for daily standup
10. **`/engineering:documentation`** — Write runbooks, architecture docs, onboarding guides

---

## 🔗 Connectors to Enable

These tools integrate with your skills:
- **GitHub** — Pull request review, code analysis
- **Linear/Asana/Atlassian** — Ticket tracking, sprint planning
- **Slack** — Incident communication, team notifications
- **Datadog/New Relic** — Observability, metrics, tracing
- **PagerDuty** — On-call rotation, incident scheduling
- **Google Calendar/Gmail** — Meeting context, team communication

---

## Next Steps

1. **Install the Engineering plugin** (you're in progress)
2. **Connect your tools** (GitHub, Linear, Slack, Datadog)
3. **Try a skill:** Use `/engineering:code-review` on a PR, or `/engineering:architecture` to design something
4. **Build workflows:** Automate code review gates, deployment checklists, postmortems

---

**Last Updated:** May 2026 | **Next Review:** Q4 2026
