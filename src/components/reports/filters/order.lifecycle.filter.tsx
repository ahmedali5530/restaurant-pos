import {REPORTS_ORDER_LIFECYCLE} from "@/routes/posr.ts";
import {Button} from "@/components/common/input/button.tsx";

export const OrderLifecycleFilter = () => {
  return (
    <form action={REPORTS_ORDER_LIFECYCLE} className="flex flex-col gap-3 items-start w-full" target="_blank">
      <div className="w-full">
        <label htmlFor="order-id">Order ID</label>
        <input
          id="order-id"
          name="order_id"
          className="form-control"
          placeholder="order:xxxx or record id suffix"
          required
        />
      </div>
      <Button variant="primary" filled type="submit">Generate</Button>
    </form>
  );
};
