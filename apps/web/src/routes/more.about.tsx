import { createFileRoute } from "@tanstack/react-router";
import { BackLink, PageHeader } from "@/components/page";
import { useAppVersion } from "@/lib/app-info";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/more/about")({ component: About });

function About() {
  const version = useAppVersion();
  return (
    <>
      <PageHeader
        title={m["about.title"]()}
        back={<BackLink to="/more" label={m.nav_more()} />}
      />
      <p className="about-brand">yumi</p>
      <dl className="import-card about-facts">
        <dt>{m["about.version"]()}</dt>
        <dd>{version ?? "…"}</dd>
        <dt>{m["about.instance"]()}</dt>
        <dd>{window.location.host}</dd>
        <dt>{m["about.operation"]()}</dt>
        <dd>{m["about.self_hosted"]()}</dd>
      </dl>
      <ul className="card-list">
        <li>
          <a
            className="more-row"
            href="https://github.com/reetzjonas/yumi"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="more-row-main">
              <span className="more-row-title">{m["about.source"]()}</span>
              <span className="meta">github.com/reetzjonas/yumi</span>
            </span>
          </a>
        </li>
      </ul>
    </>
  );
}
