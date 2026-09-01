import { Button } from "@/components/common/input/button.tsx";
import { faCopy } from "@fortawesome/free-regular-svg-icons";
import { faCodeBranch, faPencil, faSearch, faTrash } from "@fortawesome/free-solid-svg-icons";
import { useAtom } from "jotai";
import { appState } from "@/store/jotai.ts";
import { useTranslation } from "react-i18next";

export const MenuActions = () => {
  const [, setState] = useAtom(appState);
  const { t } = useTranslation('menu');

  return (
    <div className="flex gap-3 p-3 items-center border-t">
      <Button size="lg" variant="primary" icon={faCopy}>{t('actions.repeat')}</Button>
      <Button size="lg" variant="primary" icon={faPencil}>{t('actions.modify')}</Button>
      <span className="bg-neutral-400 h-[48px] w-[2px]"></span>
      <Button size="lg" variant="danger" icon={faTrash}>{t('actions.delete')}</Button>
      <Button size="lg" variant="danger" icon={faTrash} onClick={() => setState(prev => ({
        ...prev,
        cart: []
      }))}>{t('actions.deleteAll')}</Button>
      <span className="bg-neutral-400 h-[48px] w-[2px]"></span>
      <Button size="lg" variant="primary" icon={faSearch}>{t('actions.search')}</Button>
      <Button size="lg" variant="success" icon={faCodeBranch}>{t('actions.split')}</Button>
    </div>
  );
}
