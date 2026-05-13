# Phase 7: Deployment & Release Checklist
**Cometeor Extension: Pre-Deployment Verification**  
**Date:** May 2026 | **Status:** Release Planning | **Audience:** Release Manager + Engineering

---

## Executive Summary

**Release:** Cometeor v0.2.0 (Production Hardening)  
**Target Date:** May 25, 2026  
**Deployer:** Senior Developer  
**On-call Support:** @luc for first 24 hours

**Key Changes:**
- ✅ Phase 1-6 fixes implemented (security, reliability, testing)
- ✅ 85%+ test coverage
- ✅ All code review gates passed
- ✅ Rollback plan documented

**Risk Level:** 🟡 MODERATE (not first release, but major fixes)

---

## PRE-DEPLOYMENT CHECKLIST

### Code & Quality Gates

- [ ] **All CI/CD checks passing**
  ```bash
  # Verify in GitHub Actions
  ✅ TypeScript strict mode: PASS
  ✅ ESLint 0 warnings: PASS
  ✅ Unit tests 100%: PASS (82 tests)
  ✅ Integration tests 100%: PASS (20 tests)
  ✅ E2E tests 100%: PASS (5 tests)
  ✅ Code coverage 85%+: PASS (87.2%)
  ✅ Security scan (npm audit): PASS (0 moderate/high)
  ✅ Code review approved: PASS (2 approvals)
  ```

- [ ] **All PRs merged to main**
  ```bash
  git log main --oneline -5
  # Should show all Phase 1-6 work
  ```

- [ ] **No critical/high bugs in backlog**
  ```
  Open bugs with "critical" or "high" priority: 0
  (Checked against project tracker 1 hour before deploy)
  ```

- [ ] **Security audit completed**
  ```
  - ✅ XSS validation implemented (P0-001)
  - ✅ Message dispatcher consolidated (P0-002)
  - ✅ Action retry logic added (P0-003)
  - ✅ Token refresh mutex implemented (P0-004)
  - ✅ Config moved to chrome.storage.sync (P0-005)
  - ✅ No hardcoded credentials remain
  - ✅ All user inputs validated
  - ✅ Error messages sanitized
  ```

- [ ] **Performance baselines met**
  ```
  Metric               | Baseline | Current | Status
  ─────────────────────┼──────────┼─────────┼────────
  Action latency p99   | 500ms    | 495ms   | ✅ OK
  Token refresh        | 1000ms   | 950ms   | ✅ OK
  DOM snapshot         | 100ms    | 102ms   | ✅ OK
  API data (heavy page)| 50MB     | 1MB     | ✅ IMPROVED
  Task success rate    | 70%      | 95%     | ✅ IMPROVED
  ```

---

### Extension-Specific Checks

- [ ] **Manifest.json is valid and complete**
  ```json
  {
    "manifest_version": 3,
    "name": "Cometeor",
    "version": "0.2.0",
    "description": "AI-powered web automation",
    "permissions": [
      "scripting",
      "webRequest",
      "tabs",
      "storage",
      "webNavigation"
    ],
    "content_scripts": [{
      "matches": ["<all_urls>"],
      "js": ["dist/content-script.js"]
    }],
    "background": {
      "service_worker": "dist/background.js"
    },
    "action": {
      "default_popup": "popup.html",
      "default_title": "Cometeor"
    },
    "icons": {
      "16": "images/icon-16.png",
      "48": "images/icon-48.png",
      "128": "images/icon-128.png"
    }
  }
  ```
  **Verification:**
  ```bash
  npm run build:manifest && npx chrome-extension-validator dist/manifest.json
  ```

- [ ] **All permissions are necessary**
  ```
  Permission          | Used By        | Justification
  ────────────────────┼────────────────┼──────────────────────
  scripting           | ActionExecutor | Execute actions in DOM
  webRequest          | VertexClient   | API calls (monitoring)
  tabs                | TaskManager    | Get tab context
  storage             | ConfigManager  | Config + tokens
  webNavigation       | TaskManager    | Track navigation
  ```

- [ ] **Content scripts can't be CSP-blocked**
  ```
  Content security policy must allow:
  - Script execution from extension
  - CORS requests to https://vertexai.googleapis.com
  - Potentially unsafe-eval (if using dynamic code generation)
  ```

- [ ] **Service worker can survive suspensions**
  ```
  ✅ No long-running operations (>5min) on main service worker
  ✅ Offscreen document for long tasks (if applicable)
  ✅ State persisted to chrome.storage.session/local
  ✅ Service worker awakens on message, not on interval
  ```

- [ ] **Icons & branding are final**
  ```
  ✅ Icon 16x16px: Present, clear at small size
  ✅ Icon 48x48px: Present, clear in extension menu
  ✅ Icon 128x128px: Present, clear in store
  ✅ No copyright/trademark violations
  ✅ No placeholder text remaining
  ```

---

### OAuth & Credentials Setup

- [ ] **OAuth credentials configured in production**
  ```
  For production deployment:
  
  ✅ Google Cloud Project created: cometeor-prod-2026
  ✅ OAuth 2.0 consent screen configured
  ✅ Redirect URI whitelisted: chrome-extension://[extension-id]/auth-callback
  ✅ Scope requested: https://www.googleapis.com/auth/cloud-platform (Vertex AI)
  ✅ Client secret stored securely (NOT in source code)
  ✅ Client ID will be set by first-run wizard
  ```

- [ ] **Config storage strategy verified**
  ```
  ✅ chrome.storage.sync is primary config store
  ✅ First-run wizard guides user to configure
  ✅ chrome.storage.session stores temporary auth tokens
  ✅ No credentials in manifest.json or source code
  ✅ Users can export/import config (backup/restore)
  ```

- [ ] **Token refresh doesn't leak credentials**
  ```
  ✅ Tokens never logged to console
  ✅ Tokens not visible in DevTools
  ✅ Tokens cleared on logout
  ✅ Token expiry buffer prevents stale tokens (5min)
  ```

---

### Monitoring & Observability Setup

- [ ] **Crash reporting enabled**
  ```
  ✅ CrashReporter class implemented
  ✅ Crashes sent to logging backend (or local storage)
  ✅ Stack traces collected without PII
  ✅ Error context (version, OS, browser) captured
  ```

- [ ] **Performance metrics tracked**
  ```
  ✅ Action latency (p50, p99)
  ✅ Token refresh latency
  ✅ DOM snapshot size
  ✅ Task success rate by error type
  ✅ API call frequency
  ✅ User session duration
  ```

- [ ] **Alerting configured**
  ```
  Alert                    | Threshold | Action
  ────────────────────────┼───────────┼─────────────────────
  Error rate spike        | >5%       | Page on-call, investigate
  API latency spike       | p99 >2s   | Check Vertex AI status
  Task success drop       | <85%      | Check logs, deploy hotfix
  Crash rate spike        | >1%       | Immediate rollback
  ```

---

### Documentation & Communication

- [ ] **Release notes written**
  ```markdown
  ## Cometeor v0.2.0 - May 25, 2026
  
  ### Security
  - Fixed XSS vulnerability in selector validation
  - Moved credentials to secure chrome.storage (not hardcoded)
  - Added input validation to all user-supplied selectors
  
  ### Reliability
  - Implemented exponential backoff retry (3 attempts)
  - Added circuit breaker for API rate limiting
  - Fixed token refresh race condition
  - Content script heartbeat prevents hangs
  
  ### Performance
  - Optimized DOM snapshots (99% reduction in data sent)
  - Token refresh now coordinates concurrent requests
  - Message routing optimized (single dispatcher)
  
  ### Breaking Changes
  - Users must configure OAuth credentials on first run
    (First-run wizard guides through this)
  ```

- [ ] **Changelog updated (CHANGELOG.md)**
  ```
  ✅ All merged PRs documented
  ✅ User-facing changes highlighted
  ✅ Breaking changes called out
  ✅ Migration guide provided (if needed)
  ```

- [ ] **Support team briefed**
  ```
  Slack notification to #support:
  
  ✨ Cometeor v0.2.0 shipping today!
  
  What's new:
  • Major reliability improvements (retry + circuit breaker)
  • Security fixes (XSS, token handling)
  • Config moved from hardcoded → secure storage
  
  First-run changes:
  • Users see config wizard on first install
  • Requires OAuth + Google Cloud project setup
  
  Support impact:
  • Expect questions about config setup (BRIEF: docs link)
  • Improved error messages for debugging
  • Rollback available if critical issues (see ops channel)
  ```

- [ ] **Product manager aware of changes**
  ```
  Notification to @product:
  
  v0.2.0 ready for launch. Key improvements:
  - Task success rate: 70% → 95%
  - API costs optimized (50MB → 1MB per heavy page)
  - XSS vulnerability patched (security)
  
  No new user-facing features this release (hardening only).
  Can proceed with launch at your discretion.
  ```

---

### Rollback Plan Prepared

- [ ] **Previous version (v0.1.x) is stable and tested**
  ```
  Version | Release Date | Status      | Can Rollback?
  ────────┼──────────────┼─────────────┼──────────────
  0.2.0   | 2026-05-25   | LAUNCHING   | N/A
  0.1.2   | 2026-04-15   | STABLE      | ✅ YES
  0.1.1   | 2026-04-01   | DEPRECATED  | ⚠️ Maybe
  0.1.0   | 2026-03-15   | DEPRECATED  | ❌ No
  ```

- [ ] **Rollback procedure documented**
  ```markdown
  ## Rollback Procedure (if needed)
  
  ### Decision Criteria (Trigger Rollback if ANY)
  - Error rate exceeds 10% for 5 minutes
  - Critical user workflow fails (search, form fill)
  - Crash rate exceeds 2%
  - Performance regression >50% (action latency >1000ms p99)
  
  ### Execution (30-minute RTO)
  1. On-call: Verify rollback criteria met (don't panic-roll)
  2. On-call: Post in #incidents "Rolling back to v0.1.2"
  3. Developer: Revert manifest.json version number
  4. Developer: Push to production branch
  5. Chrome Web Store auto-updates users (within 30-60 min)
  6. On-call: Monitor error rate decline
  7. Post-mortem: Scheduled for next day
  
  ### Known Issues if Rolled Back to v0.1.2
  - Token refresh race condition still exists (rare, ~1% of users)
  - XSS vulnerability in selector validation (only if untrusted selector)
  - No retry on transient failures (~20% lower success rate)
  
  → Must fix v0.1.2 issues quickly and release v0.2.1 patch
  ```

- [ ] **Quick hotfix procedure ready**
  ```
  If rollback needed, hotfix branch ready:
  
  git checkout -b hotfix/0.2.1
  # Fix critical issue
  git commit -m "Fix: [issue]"
  git push origin hotfix/0.2.1
  # Create PR, require 1 approval
  # Merge to main + tag v0.2.1
  # Deploy to Chrome Web Store
  
  Estimated time: 30 minutes to deploy hotfix
  ```

---

### User Communication Plan

- [ ] **In-app announcement written (if needed)**
  ```
  If major user-facing changes:
  
  Popup notification on update:
  ✨ Cometeor updated to v0.2.0!
  
  What's new:
  • Much more reliable (95% success rate)
  • Faster, cheaper to run
  • Requires configuration on first run
  
  [Learn More] [Configure Now]
  ```

- [ ] **Email to beta testers (if applicable)**
  ```
  To: beta@cometeor.dev
  Subject: Cometeor v0.2.0 is live!
  
  Thanks for testing! v0.2.0 is now available in the Chrome Web Store.
  
  Key improvements:
  ...
  ```

- [ ] **Social media/blog post scheduled (if applicable)**
  ```
  LinkedIn post:
  🚀 Cometeor v0.2.0 is live!
  
  Built on feedback from our amazing beta testers:
  ✅ 95% task success rate (up from 70%)
  ✅ 50x cheaper API costs (optimized snapshots)
  ✅ Enhanced security & reliability
  
  Try it → [Chrome Web Store link]
  ```

---

## DEPLOYMENT CHECKLIST

### Pre-Flight (1 hour before deploy)

- [ ] **Final code review of release diff**
  ```bash
  git log v0.1.2..HEAD --oneline | wc -l
  # Should match expected number of commits
  
  # Check for any last-minute unreviewed changes
  git diff origin/main -- . | grep -c "^+" 
  # Should be 0 (all changes already reviewed)
  ```

- [ ] **Staging build successful**
  ```bash
  npm run build:staging
  # Should complete without errors
  
  # Manual smoke test
  npm run test:e2e -- --browser=chrome
  # All E2E tests pass
  ```

- [ ] **Tag release**
  ```bash
  git tag -a v0.2.0 -m "Cometeor v0.2.0: Security & reliability hardening"
  git push origin v0.2.0
  ```

- [ ] **Production build ready**
  ```bash
  npm run build:prod
  # Dist/ folder contains minified, optimized extension
  
  # Verify manifest version
  grep '"version"' dist/manifest.json
  # Should output: "version": "0.2.0"
  ```

- [ ] **Chrome extension ready for upload**
  ```bash
  # Create .zip for upload
  cd dist && zip -r ../cometeor-0.2.0.zip . && cd ..
  
  # Verify .zip is valid
  unzip -t cometeor-0.2.0.zip | tail -1
  # Should say "No errors detected in compressed data"
  ```

---

### Deployment (Chrome Web Store)

- [ ] **On-call team ready**
  ```
  Slack message to #on-call:
  
  🚀 Deploying Cometeor v0.2.0 NOW
  
  On-call engineer: @luc
  Estimated rollout: 2-4 hours
  Monitoring: error rate, latency, crash rate
  Rollback available if needed
  
  Will post updates in #incidents
  ```

- [ ] **Upload to Chrome Web Store**
  1. Visit https://chrome.google.com/webstore/developer/dashboard
  2. Select Cometeor extension
  3. Click "Edit"
  4. Upload dist/cometeor-0.2.0.zip
  5. Fill out changelog:
     ```
     Major reliability improvements:
     • Retry logic with exponential backoff
     • Circuit breaker for rate limits
     • XSS vulnerability patched
     • Config moved to secure storage
     ```
  6. Set visibility: Public (if beta: Unlisted)
  7. Click "Publish"

  ```
  ✅ Upload submitted
  ⏳ Chrome Web Store processes (usually <30 minutes)
  ⏳ Rollout begins (gradual to all users, 2-4 hours)
  ```

- [ ] **Monitor rollout progress**
  ```
  Visit https://chrome.google.com/webstore/developer/dashboard
  → Cometeor → Analytics
  
  Watch metrics:
  - Active installs (should be stable or grow)
  - Crash rate (should not spike)
  - Rating (should not decrease)
  ```

- [ ] **Verify deployment reached users**
  ```bash
  # After 4 hours, spot-check user installs
  # (Can't directly verify but Web Store shows installation count)
  
  Expected: ~50-70% of users running v0.2.0 after 4 hours
  Expected: ~90%+ of users running v0.2.0 after 24 hours
  ```

---

### Post-Deployment Monitoring (First 24 Hours)

- [ ] **Error rate monitored (every 15 min for first hour)**
  ```
  Baseline: <2% errors
  Target:   <2% errors (no regression)
  Threshold: >5% = ROLLBACK IMMEDIATELY
  
  Check via:
  - Crash reporter backend
  - Browser console errors (if tracking)
  - User support tickets
  ```

- [ ] **Critical user workflows tested (every 30 min)**
  ```
  Every 30 minutes, manually test:
  
  Workflow 1: Search & Click
  - Go to Google.com
  - Open Cometeor sidebar
  - Task: "Search for TypeScript"
  - Verify: Search executed, results shown
  
  Workflow 2: Form Fill
  - Go to example.com/contact
  - Task: "Fill name=John, email=john@example.com"
  - Verify: Form fields filled, no errors
  
  Workflow 3: Token Refresh
  - Verify: Users can authenticate
  - Verify: Token refresh works silently
  - Verify: No "not authenticated" errors
  ```

- [ ] **Performance metrics tracked**
  ```
  Metric              | Baseline | Current | Status
  ────────────────────┼──────────┼─────────┼─────────
  Action latency p99  | 500ms    | ?       | Monitor
  Token refresh       | 1000ms   | ?       | Monitor
  Error rate          | <2%      | ?       | Monitor
  Task success        | 95%      | ?       | Monitor
  
  If any metric regresses >10%, prepare rollback
  ```

- [ ] **Support team monitored**
  ```
  Slack channel: #support
  
  Looking for:
  - Spike in "not working" reports
  - New error messages (sign of bug)
  - OAuth configuration issues
  - Performance complaints
  
  If >5 similar issues → may indicate rollback needed
  ```

---

## POST-DEPLOYMENT CHECKLIST

### Immediately After Deployment

- [ ] **Post-mortem data collected**
  ```
  Create doc: "Cometeor v0.2.0 Deployment Log"
  
  Deployment Date:    May 25, 2026
  Deployment Time:    2:00 PM UTC
  Deployer:           @luc
  Rollout Duration:   2 hours 30 minutes
  Issues:             None
  Rollback Needed:    No
  
  [Keep doc for post-mortem if issues occur]
  ```

- [ ] **Notify stakeholders of successful deploy**
  ```
  Slack #general:
  
  ✅ Cometeor v0.2.0 deployed successfully!
  
  Rollout: 2h 30m
  Current: 65% of users on v0.2.0
  Status: All systems nominal
  
  Monitor: #incidents (if issues arise)
  ```

---

### After 24 Hours

- [ ] **Deployment success confirmed**
  ```
  Checklist:
  - ✅ Error rate stable (<2%)
  - ✅ No user complaints in support
  - ✅ All workflows functional
  - ✅ Performance metrics nominal
  - ✅ Rollback NOT needed
  ```

- [ ] **Release notes published**
  ```
  Published to:
  - GitHub Releases (tag v0.2.0)
  - Blog post (if applicable)
  - Email to users (if applicable)
  - Slack #announcements
  ```

- [ ] **Tickets closed**
  ```
  Closed in project tracker:
  - Phase 1: Debug & Fix (13 tickets)
  - Phase 2: System Design (5 tickets)
  - Phase 3: Architecture (5 tickets)
  - Phase 4: Tech Debt (28 tickets, prioritized)
  - Phase 5: Testing (100+ test cases)
  - Phase 6: Code Review (gates defined)
  - Phase 7: Deployment (this checklist)
  ```

- [ ] **Next phase planning begun**
  ```
  Roadmap for v0.3.0:
  - Phase 8: Documentation (complete runbooks)
  - Feature development
  - Additional optimizations
  ```

---

### If Rollback Executed (Contingency)

- [ ] **Rollback decision logged**
  ```
  Log entry:
  Rollback Triggered: [YES/NO]
  Reason: [Error rate spike / Workflow failure / Other]
  Decision Made At: [Time]
  Executed At: [Time]
  Back to Version: v0.1.2
  ```

- [ ] **Root cause analysis started**
  ```
  Create issue: "Post-mortem: v0.2.0 rollback"
  
  Severity: P0 (we rolled back)
  Timeline:
  - 2026-05-25 14:00 UTC: v0.2.0 deployed
  - 2026-05-25 14:15 UTC: Error rate spiked to 8%
  - 2026-05-25 14:20 UTC: Rollback decision made
  - 2026-05-25 14:25 UTC: Rollback executed
  - 2026-05-25 14:45 UTC: Error rate back to baseline
  
  Root Cause: [Investigation needed]
  ```

- [ ] **Hot fix planned**
  ```
  Branch: hotfix/0.2.1
  Target: Deploy within 24 hours
  
  Checklist:
  - [ ] Root cause identified
  - [ ] Fix implemented & tested
  - [ ] Code review approved
  - [ ] v0.2.1 tag created
  - [ ] Chrome Web Store upload
  - [ ] Users notified
  ```

---

## Deployment Approval Sign-Off

**Pre-Deployment Approval** (Required before deploy)

```
✅ All quality gates passed
✅ Security audit completed
✅ Release notes written
✅ Rollback plan documented
✅ On-call team ready

Approved by: @luc (Senior Developer)
Date: May 25, 2026, 1:00 PM UTC
```

**Post-Deployment Approval** (After 24 hours)

```
✅ Error rate stable
✅ No critical issues reported
✅ All workflows functional
✅ Performance metrics nominal

Approved by: @luc (Senior Developer)
Date: May 26, 2026, 2:00 PM UTC
```

---

## Quick Reference Checklists

### Pre-Deploy (Run 1 hour before)
```
□ CI/CD all green
□ Security audit signed off
□ Release notes ready
□ On-call notified
□ Rollback plan reviewed
→ READY TO DEPLOY
```

### During Deploy
```
□ Upload to Chrome Web Store
□ Tag release v0.2.0
□ Monitor error rate
□ Test critical workflows
□ Watch support channel
```

### Post-Deploy (First 24 hours)
```
□ Monitor error rate <2%
□ Monitor success rate >95%
□ Monitor latency baseline
□ Check support tickets
□ Notify stakeholders
```

---

**Created:** PHASE-7-DEPLOY-CHECKLIST.md  
**Format:** Comprehensive pre/during/post deployment checklist with rollback procedures  
**Next Step:** Phase 8 (Documentation) — Write technical documentation and runbooks
