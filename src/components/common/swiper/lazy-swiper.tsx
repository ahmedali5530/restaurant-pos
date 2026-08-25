import {
  Children,
  createElement,
  isValidElement,
  useEffect,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";

type SwiperReact = typeof import("swiper/react");
type SwiperProps = ComponentProps<SwiperReact["Swiper"]>;
type SwiperSlideProps = ComponentProps<SwiperReact["SwiperSlide"]>;

let cached: SwiperReact | null = null;
let loading: Promise<SwiperReact> | null = null;

function loadSwiperReact() {
  if (cached) return Promise.resolve(cached);
  if (!loading) {
    loading = import("swiper/react").then((m) => {
      cached = m;
      return m;
    });
  }
  return loading;
}

/**
 * Placeholder slide used before/while the Swiper module loads.
 * `Swiper` remaps these to the real `SwiperSlide` so Swiper recognizes them.
 */
export function SwiperSlide(_props: SwiperSlideProps) {
  return null;
}

/** Code-split Swiper so it is not inlined into the main app chunk. */
export function Swiper({children, ...props}: SwiperProps) {
  const [mod, setMod] = useState<SwiperReact | null>(cached);

  useEffect(() => {
    let alive = true;
    loadSwiperReact().then((m) => {
      if (alive) setMod(m);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!mod) {
    return <div className={props.className as string | undefined}/>;
  }

  const {Swiper: SwiperRoot, SwiperSlide: RealSlide} = mod;

  const slides = Children.map(children as ReactNode, (child) => {
    if (!isValidElement(child)) return child;
    if (child.type === SwiperSlide) {
      return createElement(RealSlide, {
        ...(child.props as SwiperSlideProps),
        key: child.key ?? undefined,
      });
    }
    return child;
  });

  return createElement(SwiperRoot, props as SwiperProps, slides);
}
