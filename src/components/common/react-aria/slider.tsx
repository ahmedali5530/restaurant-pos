import { Label, Slider as BaseSlider, SliderOutput, SliderThumb, SliderTrack } from 'react-aria-components';

export interface SliderProps {
  value: number;
  defaultValue?: number;
  onChange: (newValue: number) => void;
  label?: string;
  minValue: number
  maxValue: number
  step: number
}

export const Slider = ({
  onChange, value, defaultValue, label, maxValue, minValue, step
}: SliderProps) => {
  return (
    <BaseSlider
      defaultValue={defaultValue}
      value={value}
      onChange={onChange}
      minValue={minValue}
      maxValue={maxValue}
      step={step}
    >
      <div className="flex mb-3">
        <Label className="flex-1">{label}</Label>
        <SliderOutput/>
      </div>
      <SliderTrack className="relative w-full h-1 bg-neutral-500">
        {({ state }) => (
          <>
            {/* track */}
            <div className="absolute h-2 top-[50%] translate-y-[-50%] w-full rounded-full"/>
            {/* fill */}
            <div
              className="absolute h-2 top-[50%] translate-y-[-50%] rounded-full"
              style={{ width: state.getThumbPercent(0) * 100 + '%' }}
            />
            <SliderThumb
              className="h-5 w-5 top-[50%] rounded-full border border-neutral-800/75 transition dragging:bg-neutral-100 outline-none bg-neutral-500"/>
          </>
        )}
      </SliderTrack>
    </BaseSlider>
  )
}
