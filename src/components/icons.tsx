/**
 * The icons, drawn here rather than fetched.
 *
 * One stroke weight, one size, no icon package: a dozen shapes at 1.6 stroke on
 * a 24 grid, which keeps the sidebar consistent and the page weight honest.
 * Every icon takes its colour from the text around it.
 */
type Props = { size?: number; className?: string };

function Svg({ size = 18, className = "", children }: Props & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export const IconDashboard = (p: Props) => (
  <Svg {...p}>
    <path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 8h6V4h-6z" />
  </Svg>
);

export const IconLeads = (p: Props) => (
  <Svg {...p}>
    <path d="M3 7h18M6 12h12M10 17h4" />
  </Svg>
);

export const IconProjects = (p: Props) => (
  <Svg {...p}>
    <path d="M3 21h18M6 21V8l6-4 6 4v13M10 21v-5h4v5M9 11h.01M15 11h.01" />
  </Svg>
);

export const IconClients = (p: Props) => (
  <Svg {...p}>
    <path d="M16 20v-1a4 4 0 0 0-8 0v1M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M20 20v-1a4 4 0 0 0-3-3.85" />
  </Svg>
);

export const IconContracts = (p: Props) => (
  <Svg {...p}>
    <path d="M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5" />
  </Svg>
);

export const IconAgents = (p: Props) => (
  <Svg {...p}>
    <path d="M12 3l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4L4.2 8.7l5.4-.8z" />
  </Svg>
);

/* The companies: a briefcase, so it is not mistaken for the team's people. */
export const IconPartners = (p: Props) => (
  <Svg {...p}>
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 12.5h18M11 12.5v1.5h2v-1.5" />
  </Svg>
);

export const IconCommissions = (p: Props) => (
  <Svg {...p}>
    <path d="M6 18L18 6M8.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5M15.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5" />
  </Svg>
);

export const IconCampaigns = (p: Props) => (
  <Svg {...p}>
    <path d="M3 5h18v14H3zM3 6l9 7 9-7" />
  </Svg>
);

export const IconInvoices = (p: Props) => (
  <Svg {...p}>
    <path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM10 8h4M9 12h6" />
  </Svg>
);

export const IconReports = (p: Props) => (
  <Svg {...p}>
    <path d="M4 20h16M7 20V10M12 20V5M17 20v-7" />
  </Svg>
);

export const IconSearch = (p: Props) => (
  <Svg {...p}>
    <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M20 20l-4.2-4.2" />
  </Svg>
);

export const IconPlus = (p: Props) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const IconBell = (p: Props) => (
  <Svg {...p}>
    <path d="M18 15V10a6 6 0 1 0-12 0v5l-1.5 3h15zM10 21h4" />
  </Svg>
);

export const IconMoon = (p: Props) => (
  <Svg {...p}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5" />
  </Svg>
);

export const IconSun = (p: Props) => (
  <Svg {...p}>
    <path d="M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8M12 2v2M12 20v2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4 4.2 19.8M19.8 4.2l-1.4 1.4" />
  </Svg>
);

export const IconMenu = (p: Props) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);

export const IconClose = (p: Props) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

export const IconCheck = (p: Props) => (
  <Svg {...p}>
    <path d="M4 12.5 9 17.5 20 6.5" />
  </Svg>
);

export const IconAlert = (p: Props) => (
  <Svg {...p}>
    <path d="M12 4l9 16H3zM12 10v4M12 17h.01" />
  </Svg>
);

export const IconKeyboard = (p: Props) => (
  <Svg {...p}>
    <path d="M3 7h18v10H3zM7 11h.01M11 11h.01M15 11h.01M8 14h8" />
  </Svg>
);

export const IconSettings = (p: Props) => (
  <Svg {...p}>
    <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.08a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.08A1.7 1.7 0 0 0 4.6 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.08A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.01a1.7 1.7 0 0 0 1.56 1.02H21a2 2 0 1 1 0 4h-.08a1.7 1.7 0 0 0-1.52 1z" />
  </Svg>
);

export const IconLogout = (p: Props) => (
  <Svg {...p}>
    <path d="M10 20H5V4h5M15 8l4 4-4 4M9 12h10" />
  </Svg>
);

export const IconArrow = (p: Props) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);

export const IconClock = (p: Props) => (
  <Svg {...p}>
    <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2" />
  </Svg>
);

export const IconGrip = (p: Props) => (
  <Svg {...p}>
    <path d="M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01" strokeWidth="2.4" />
  </Svg>
);

export const IconUp = (p: Props) => (
  <Svg {...p}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Svg>
);

export const IconDown = (p: Props) => (
  <Svg {...p}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </Svg>
);

export const IconEye = (p: Props) => (
  <Svg {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6" />
  </Svg>
);

export const IconEyeOff = (p: Props) => (
  <Svg {...p}>
    <path d="M4 4l16 16M9.9 5.8A8.6 8.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.6 3.3M6.6 8.2A16 16 0 0 0 2.5 12S6 18.5 12 18.5c.8 0 1.5-.1 2.2-.3M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </Svg>
);

export const IconLayout = (p: Props) => (
  <Svg {...p}>
    <path d="M3 4h18v16H3zM3 9h18M9 9v11" />
  </Svg>
);

/** The icon each section of the CRM wears, keyed by its address. */
export const IconCalendar = (p: Props) => (
  <Svg {...p}>
    <path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M8 14h2M14 14h2M8 17h2" />
  </Svg>
);

/** The month view: a page of days with the current one marked. */
export const IconMonth = (p: Props) => (
  <Svg {...p}>
    <path d="M3 5h18v16H3zM3 9h18M7 2.5v4M17 2.5v4M7 13h2M11 13h2M15 13h2M7 17h2M11 17h2" />
    <circle cx="16" cy="17" r="1.6" />
  </Svg>
);

/** A building going up, with its crane. */
export const IconConstructor = (p: Props) => (
  <Svg {...p}>
    <path d="M4 21h16M6 21V11h7v10M9 14h1M9 17h1M13 4h7M16 4v6M20 4v3M16 10l-3 1" />
  </Svg>
);

export const IconFollowUp = (p: Props) => (
  <Svg {...p}>
    <path d="M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16M12 9v4l2.5 2M9 2h6" />
  </Svg>
);

export const IconTeam = (p: Props) => (
  <Svg {...p}>
    <path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6M3 20v-1a5 5 0 0 1 10 0v1M16 11a2.5 2.5 0 1 0 0-5M17 14.5a4.5 4.5 0 0 1 4 4.5v1" />
  </Svg>
);

export const IconAutoEmail = (p: Props) => (
  <Svg {...p}>
    <path d="M3 6h14v10H3zM3 7l7 5 7-5M19 13v4l2.5 1.5M19 21a4 4 0 1 0 0-8" />
  </Svg>
);

export const IconChevron = (p: Props) => (
  <Svg {...p}>
    <path d="M9 6l6 6-6 6" />
  </Svg>
);

export const SECTION_ICONS: Record<string, (p: Props) => React.ReactElement> = {
  "/calendar": IconMonth,
  "/appointments": IconCalendar,
  "/follow-ups": IconFollowUp,
  "/team": IconTeam,
  "/emails": IconAutoEmail,
  "/": IconDashboard,
  "/leads": IconLeads,
  "/projects": IconProjects,
  "/clients": IconClients,
  "/contracts": IconContracts,
  "/agents": IconAgents,
  "/subowners": IconPartners,
  "/constructors": IconConstructor,
  "/commissions": IconCommissions,
  "/campaigns": IconCampaigns,
  "/invoices": IconInvoices,
  "/reports": IconReports,
};
