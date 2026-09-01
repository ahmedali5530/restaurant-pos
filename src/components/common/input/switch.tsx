import {nanoid} from "nanoid";
import {FC, InputHTMLAttributes, PropsWithChildren, useMemo} from "react";

interface Props extends PropsWithChildren, InputHTMLAttributes<HTMLInputElement> {
}

export const Switch: FC<Props> = ({children, ...rest}) => {
  const id = useMemo(() => nanoid(5), []);

  return (
    <div className="switch">
      <label htmlFor={id}>
        <input {...rest} type="checkbox" id={rest.id || id}/>
        {children && (
          <span className="ml-3 select-none">
            {children}
          </span>
        )}
      </label>
    </div>
  );
};
