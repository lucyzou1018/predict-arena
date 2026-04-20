import { useT } from "../context/LangContext";

export function Footer() {
  const t = useT();
  return (
    <footer className="relative z-10 pt-10 pb-8 border-t border-white/[0.06]">
      <div className="max-w-7xl mx-auto px-6">
        <p className="text-white/15 text-[10px] text-center">
          {t("landing.footer.rights")}
        </p>
      </div>
    </footer>
  );
}
