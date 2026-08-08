export type AccountantReview = {
  id: string;
  name: string;
  role: string;
  firm: string;
  location: string;
  photo: string;
  /** Short SEO-friendly topic the review targets */
  topic: string;
  quote: string;
  rating: number;
};

/** Practice reviews — used in UI + Review JSON-LD for SEO */
export const ACCOUNTANT_REVIEWS: AccountantReview[] = [
  {
    id: "priya",
    name: "Priya Nair",
    role: "Practice manager",
    firm: "Nair & Co Accountants",
    location: "Birmingham",
    photo: "/reviews/review-priya.png",
    topic: "MTD VAT and multi-client practice software",
    quote:
      "Honestly? Filing week used to wreck me. Five HMRC logins, a Companies House tab, and a spreadsheet I pretended was a deadline board. With HydraTax every client’s VAT return, CT600 and payroll sits on one desk. My juniors just work the queue. We finished March with an afternoon spare — that never happened on the old stack.",
    rating: 5,
  },
  {
    id: "james",
    name: "James Okonkwo",
    role: "Partner",
    firm: "Okonkwo Partners",
    location: "London",
    photo: "/reviews/review-james.png",
    topic: "CT600 corporation tax filing software for accountants",
    quote:
      "I care about partner sign-off more than pretty dashboards. The prepare → review → submit flow means a junior can’t fire a CT600 half-done, and I still get the audit trail when I approve. Fraud-prevention headers are collected properly — we used to mess that up filing straight from HMRC. This feels like software written for a UK practice, not a side project for directors.",
    rating: 5,
  },
  {
    id: "amira",
    name: "Amira Khan",
    role: "Sole practitioner",
    firm: "Amira Khan Accountancy",
    location: "Leicester",
    photo: "/reviews/review-amira.png",
    topic: "Self Assessment and VAT software for sole practitioners",
    quote:
      "I’m on my own — no back office to retype numbers. What I like is that the books feed MTD VAT and Self Assessment without me copying into another portal. Those 1p rounding fights with clients? Mostly gone. I spend the time on the call answering what they actually asked, not explaining why Box 1 drifted.",
    rating: 5,
  },
  {
    id: "tom",
    name: "Tom Reynolds",
    role: "Payroll lead",
    firm: "Northgate Practice",
    location: "Leeds",
    photo: "/reviews/review-tom.png",
    topic: "PAYE RTI and FPS payroll filing software",
    quote:
      "Payday used to mean export-from-A, login-to-B, pray the FPS went through. Running RTI from the same client file as the rest of the work is the bit that sold the team. We pushed more employers through on the same headcount, and the ‘where’s that FPS?’ Slack thread finally died. That’s the win for me.",
    rating: 5,
  },
  {
    id: "sarah",
    name: "Sarah Whitfield",
    role: "Office manager",
    firm: "Whitfield Family Practice",
    location: "Bristol",
    photo: "/reviews/review-sarah.png",
    topic: "UK accountant software with filing deadlines",
    quote:
      "Clients don’t care which portal we use — they care we don’t miss the VAT or Companies House date. Seeing what’s due next to the actual work means I stop chasing staff for status updates. Calmest filing season in years. If you’re comparing practice software on ‘will my team actually use it?’, start here.",
    rating: 5,
  },
  {
    id: "daniel",
    name: "Daniel Park",
    role: "Senior accountant",
    firm: "Park & Hale LLP",
    location: "Manchester",
    photo: "/reviews/review-daniel.png",
    topic: "Companies House confirmation statement software for accountants",
    quote:
      "Confirmation statements and year-end accounts used to live in a totally different tool from CT600. Putting Companies House next to HMRC on the same practice desk killed the ‘which system has this company?’ confusion. HydraTax doesn’t pretend directors will do this themselves — it’s for the accountant running the engagement, which is exactly who we are.",
    rating: 5,
  },
];
