import {Button} from "@/components/common/input/button.tsx";
import {useAtom} from "jotai";
import {appPage} from "@/store/jotai.ts";

export const TouchSettings = () => {
  const [page, setPage] = useAtom(appPage);
  return (
    <div className="shadow p-5 rounded bg-white">
      <div className="flex items-start mb-5">
        <div>
          <h2 className="text-xl font-semibold mb-1">On screen keyboard</h2>
          <p className="text-sm text-neutral-500">Enable or disable on screen keyboard. Only applies to this device.</p>
        </div>
      </div>
      <Button variant={page.touch ? 'success' : 'danger'} size="lg" onClick={() => {
        setPage(prev => ({
          ...prev,
          touch: !prev.touch
        }))
      }}>
        {page.touch ? 'Enabled' : 'Disabled'}
      </Button>
    </div>
  )
}