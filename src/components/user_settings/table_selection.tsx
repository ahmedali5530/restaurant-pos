import {Button} from "@/components/common/input/button.tsx";
import {useAtom} from "jotai";
import {appState} from "@/store/jotai.ts";

export const TableSelectionSettings = () => {
  const [state, setState] = useAtom(appState);

  return (
    <div className="shadow p-5 rounded bg-white">
      <div className="flex items-start mb-5">
        <div>
          <h2 className="text-xl font-semibold mb-1">Hide table selection from menu</h2>
          <p className="text-sm text-neutral-500">
            Skip table selection and open the menu directly. Only applies to this device.
          </p>
        </div>
      </div>
      <Button
        variant={state.hideTableSelection ? 'success' : 'danger'}
        size="lg"
        onClick={() => {
          setState(prev => ({
            ...prev,
            hideTableSelection: !prev.hideTableSelection,
          }));
        }}
      >
        {state.hideTableSelection ? 'Enabled' : 'Disabled'}
      </Button>
    </div>
  );
};
