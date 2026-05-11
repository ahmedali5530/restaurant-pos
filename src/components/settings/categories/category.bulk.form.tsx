import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {Controller, useForm} from "react-hook-form";
import {useDB} from "@/api/db/db.ts";
import {toast} from "sonner";
import * as yup from "yup";
import {yupResolver} from "@hookform/resolvers/yup";
import {Category} from "@/api/model/category.ts";
import {Switch} from "@/components/common/input/switch.tsx";

interface Props {
  open: boolean
  onClose: () => void;
  data: Category[]
}

const validationSchema = yup.object({
  show_in_menu: yup.boolean().required("This is required")
});

export const CategoryBulkForm = ({
  open, onClose, data
}: Props) => {
  const db = useDB();

  const closeModal = () => {
    onClose();
    reset({
      show_in_menu: false
    });
  };

  const {control, handleSubmit, reset} = useForm({
    resolver: yupResolver(validationSchema),
    defaultValues: {
      show_in_menu: false
    }
  });

  const onSubmit = async (values: any) => {
    if (!data?.length) {
      toast.error("No categories selected");
      return;
    }

    try {
      await Promise.all(
        data.map((category) => db.merge(category.id, {
          show_in_menu: values.show_in_menu
        }))
      );

      toast.success(`${data.length} categories updated`);
      closeModal();
    } catch (error) {
      toast.error(error);
      console.log(error);
    }
  };

  return (
    <Modal
      title={`Bulk update ${data?.length || 0} categories`}
      open={open}
      onClose={closeModal}
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="mb-3">
          <Controller
            name="show_in_menu"
            control={control}
            render={({field}) => (
              <Switch checked={field.value} onChange={field.onChange}>
                Show this category in menu
              </Switch>
            )}
          />
        </div>
        <div>
          <Button type="submit" variant="primary">Save</Button>
        </div>
      </form>
    </Modal>
  );
};
