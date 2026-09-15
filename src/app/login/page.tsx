import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getTranslator } from "@/i18n";
import Logo from "@/components/Logo";
import LoginForm from "./LoginForm";

/**
 * The first thing anybody sees.
 *
 * It is worth more than a box in the middle of a grey page: this is the screen
 * that tells the office, twice a day, what kind of tool they are about to use.
 * So the sign in sits on one side and the developments the CRM is actually for
 * sit on the other, drawn rather than photographed, because a photograph would
 * have to be somebody's and a drawing is nobody's. On a telephone the drawing
 * steps aside and the form takes the screen.
 */
export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/");
  const { t } = await getTranslator();

  return (
    <main className="loginpage">
      <section className="loginside no-print" aria-hidden="true">
        <div className="loginglow" />
        <svg
          viewBox="0 0 520 300"
          preserveAspectRatio="xMidYMax slice"
          className="loginart"
          role="presentation"
        >
          {/* Three buildings on a shoreline, in the brand's own colours. */}
          <defs>
            <linearGradient id="tower" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(255,255,255,0.22)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0.06)" />
            </linearGradient>
          </defs>

          <g className="loginwave">
            <path
              d="M0 232 C 90 218, 170 246, 260 232 C 350 218, 430 246, 520 232 L520 300 L0 300 Z"
              fill="rgba(255,255,255,0.10)"
            />
            <path
              d="M0 252 C 100 238, 180 266, 270 252 C 360 238, 440 266, 520 252 L520 300 L0 300 Z"
              fill="rgba(255,255,255,0.07)"
            />
          </g>

          <g className="logintowers">
            <rect x="76" y="70" width="108" height="164" rx="7" fill="url(#tower)" />
            <rect x="206" y="24" width="126" height="210" rx="7" fill="url(#tower)" />
            <rect x="354" y="98" width="96" height="136" rx="7" fill="url(#tower)" />

            {/* Windows, a few of them lit, which is what an evening looks like. */}
            {[0, 1, 2, 3, 4, 5, 6].map((row) =>
              [0, 1, 2].map((column) => (
                <rect
                  key={`a-${row}-${column}`}
                  x={92 + column * 30}
                  y={88 + row * 20}
                  width={16}
                  height={12}
                  rx={2}
                  fill={
                    (row + column) % 3 === 0 ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.16)"
                  }
                />
              )),
            )}
            {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((row) =>
              [0, 1, 2, 3].map((column) => (
                <rect
                  key={`b-${row}-${column}`}
                  x={220 + column * 28}
                  y={42 + row * 21}
                  width={15}
                  height={12}
                  rx={2}
                  fill={
                    (row * column) % 4 === 1 ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.14)"
                  }
                />
              )),
            )}
            {[0, 1, 2, 3, 4, 5].map((row) =>
              [0, 1].map((column) => (
                <rect
                  key={`c-${row}-${column}`}
                  x={370 + column * 34}
                  y={116 + row * 20}
                  width={18}
                  height={12}
                  rx={2}
                  fill={
                    (row + column) % 4 === 0 ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.15)"
                  }
                />
              )),
            )}
          </g>
        </svg>

        <div className="loginwords">
          <p className="loginhead">{t("login.side")}</p>
          <p className="loginnote">{t("login.sideNote")}</p>
        </div>
      </section>

      <section className="loginmain">
        <div className="w-full max-w-sm">
          <div className="mb-7">
            <Logo width={168} />
            <div className="mt-2 text-sm text-brand-graphite/70">{t("app.subtitle")}</div>
          </div>

          <div className="card logincard p-6">
            <h1 className="mb-1 text-lg font-semibold tracking-tight">{t("login.title")}</h1>
            <p className="mb-5 text-xs text-brand-graphite/65">{t("login.hint")}</p>
            <LoginForm
              labels={{
                email: t("login.email"),
                password: t("login.password"),
                submit: t("login.submit"),
                failed: t("login.failed"),
              }}
            />
          </div>
        </div>
      </section>
    </main>
  );
}
