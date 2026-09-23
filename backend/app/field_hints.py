"""Curated guidance for each generic document's template-derived fields.

The field list itself comes from the templates (see app.documents); these
hints are what let the assistant ask sensible questions about each one.
Shared hints cover variables that mean the same thing across Common Paper
documents; per-document hints override or add to them. A test asserts every
derived field has a hint and every hint names a real field, so a template
change can't silently leave a field unexplained (or a hint orphaned).
"""

from __future__ import annotations

# Fields collected as ISO dates (YYYY-MM-DD) rather than free text.
DATE_FIELDS = {"Effective Date", "Order Date", "BAA Effective Date"}

SHARED_HINTS: dict[str, str] = {
    "Effective Date": "The date the agreement takes effect (YYYY-MM-DD).",
    "Governing Law": 'The jurisdiction whose laws govern the agreement, e.g. "Delaware".',
    "Chosen Courts": 'The courts that hear disputes, e.g. "the state and federal courts in New Castle County, Delaware".',
    "General Cap Amount": 'The general limit on each party\'s liability, e.g. "the fees paid in the prior 12 months" or "$100,000".',
    "Increased Cap Amount": 'A higher liability cap for the Increased Claims, e.g. "3x the General Cap Amount", or "none".',
    "Increased Claims": 'Claims subject to the Increased Cap Amount instead of the general cap, e.g. "breaches of data protection obligations", or "none".',
    "Unlimited Claims": 'Claims with no liability cap at all, e.g. "breach of confidentiality", or "none".',
    "Additional Warranties": "Any warranties beyond the standard terms, or \"none\".",
    "DPA": 'The data processing agreement that applies, if any, e.g. "the Common Paper DPA signed by the parties", or "none".',
    "Security Policy": "The security policy or standards the provider must follow (a document name or URL), or \"none\".",
    "Provider Covered Claims": "Third-party claims the provider will defend and indemnify against, e.g. \"claims that the service infringes a third party's IP\".",
    "Customer Covered Claims": 'Third-party claims the customer will defend and indemnify against, e.g. "claims arising from Customer Content".',
    "Subscription Period": 'How long each subscription lasts, e.g. "12 months".',
    "Order Date": "The date the order form is signed (YYYY-MM-DD).",
    "Non-Renewal Notice Date": 'How far ahead a party must give notice to stop auto-renewal, e.g. "30 days before the end of the Subscription Period".',
    "Payment Process": 'How and when invoices are paid, e.g. "invoiced annually in advance, payable net 30".',
    "Agreement": 'The underlying agreement this document supplements, e.g. "the Cloud Service Agreement between the parties dated 2026-01-15".',
    "Fees": 'What is paid and how much, e.g. "$5,000 per month", or "none".',
}

DOCUMENT_HINTS: dict[str, dict[str, str]] = {
    "ai-addendum": {
        "Training Data": "What customer data (if any) the provider may use to train models, or \"none\" to prohibit training.",
        "Training Purposes": 'What training on that data is allowed for, e.g. "improving the provider\'s general models", or "none".',
        "Training Restrictions": 'Limits on training, e.g. "data must be de-identified first", or "none".',
        "Improvement Restrictions": 'Limits on using inputs/outputs to improve the AI system without training, or "none".',
    },
    "baa": {
        "Limitations": "Any limits on how the provider may use or disclose protected health information, or \"none\".",
        "Breach Notification Period": 'How quickly the provider must report a breach of PHI, e.g. "5 business days after discovery".',
        "BAA Effective Date": "The date this BAA takes effect (YYYY-MM-DD).",
    },
    "csa": {
        "Technical Support": 'The support the provider offers, e.g. "email support during business hours, per the SLA".',
    },
    "dpa": {
        "Categories of Personal Data": 'Types of personal data processed, e.g. "names, email addresses, usage logs".',
        "Categories of Data Subjects": 'Whose data it is, e.g. "the customer\'s employees and end users".',
        "Special Category Data": 'Any sensitive (GDPR special category) data processed, e.g. "health data", or "none".',
        "Special Category Data Restrictions or Safeguards": "Extra safeguards for that sensitive data, or \"none\".",
        "Frequency of Transfer": 'How often data is transferred, e.g. "continuous" or "one-off".',
        "Nature and Purpose of Processing": 'What the processing is and why, e.g. "hosting and analysing customer data to provide the service".',
        "Duration of Processing": 'How long processing lasts, e.g. "the term of the Agreement plus 30 days".',
        "Approved Subprocessors": "Subprocessors the customer approves (names or a URL listing them).",
        "Governing Member State": 'The EU member state whose law governs the standard contractual clauses, e.g. "Ireland".',
        "Provider Security Contact": "Who to contact about security incidents at the provider (name and email).",
    },
    "design-partner-agreement": {
        "Term": 'How long the design partnership lasts, e.g. "6 months from the Effective Date".',
        "Program": "What the design partner program involves: product access, feedback expected, meetings, etc.",
    },
    "psa": {
        "Customer Policies": "Customer policies the provider's staff must follow on-site or on customer systems, or \"none\".",
        "Deliverables": "What the provider will deliver under the statement of work.",
        "Rejection Period": 'How long the customer has to accept or reject a deliverable, e.g. "10 business days".',
        "Resubmission Period": 'How long the provider has to fix and resubmit a rejected deliverable, e.g. "10 business days".',
        "Customer Obligations": 'What the customer must provide, e.g. "timely access to staff and systems".',
        "Time of Assignment": 'When ownership of deliverables passes to the customer, e.g. "upon payment in full".',
        "Payment Period": 'How long the customer has to pay each invoice, e.g. "30 days".',
        "SOW Term": 'How long each statement of work lasts, e.g. "until the deliverables are accepted".',
        "Insurance Minimums": 'Insurance the provider must carry, e.g. "$1M general liability", or "none".',
    },
    "partnership-agreement": {
        "Obligations": "What each party commits to do under the partnership.",
        "Payment Schedule": 'When payments between the parties are due, e.g. "quarterly".',
        "Territory": 'Where the partnership applies, e.g. "North America".',
        "Brand Guidelines": "The brand/trademark usage guidelines each party must follow (a document or URL), or \"none\".",
        "End Date": 'When the partnership ends, e.g. "2 years after the Effective Date".',
        "Company Covered Claim": "Third-party claims the company will defend and indemnify against.",
        "Partner Covered Claims": "Third-party claims the partner will defend and indemnify against.",
    },
    "pilot-agreement": {
        "Pilot Period": 'How long the pilot runs, e.g. "90 days from the Effective Date".',
    },
    "sla": {
        "Target Uptime": 'The monthly availability target, e.g. "99.9%".',
        "Target Response Time": 'How quickly support requests get a first response, e.g. "4 business hours".',
        "Support Channel": 'Where support requests are sent, e.g. "support@provider.com".',
        "Uptime Credit": 'The service credit when uptime is missed, e.g. "5% of monthly fees per 0.1% below target".',
        "Response Time Credit": 'The service credit when response time is missed, e.g. "2% of monthly fees per missed response".',
        "Scheduled Downtime": 'Planned maintenance windows excluded from uptime, e.g. "Sundays 2-4am UTC with 48 hours\' notice".',
    },
    "software-license-agreement": {
        "Permitted Uses": 'What the customer may use the software for, e.g. "internal business purposes".',
        "License Limits": 'Caps on use, e.g. "up to 50 users" or "one production environment".',
        "Deletion Procedure": "What the customer must do with the software when the license ends, e.g. \"delete all copies within 30 days\".",
        "Warranty Period": 'How long the software warranty lasts, e.g. "90 days from delivery".',
    },
}


def hint_for(doc_id: str, label: str) -> str:
    return DOCUMENT_HINTS.get(doc_id, {}).get(label) or SHARED_HINTS.get(label) or f"The {label} for this agreement."
