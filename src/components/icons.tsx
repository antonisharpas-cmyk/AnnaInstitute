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

export const IconPartners = (p: Props) => (
  <Svg {...p}>
    <path d="M8 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6M16 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6M3 20v-1a4 4 0 0 1 4-4h2M15 15h2a4 4 0 0 1 4 4v1" />
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

/** The icon each section of the CRM wears, keyed by its address. */
export const SECTION_ICONS: Record<string, (p: Props) => React.ReactElement> = {
  "/": IconDashboard,
  "/leads": IconLeads,
  "/projects": IconProjects,
  "/clients": IconClients,
  "/contracts": IconContracts,
  "/agents": IconAgents,
  "/subowners": IconPartners,
  "/commissions": IconCommissions,
  "/campaigns": IconCampaigns,
  "/invoices": IconInvoices,
  "/reports": IconReports,
};
