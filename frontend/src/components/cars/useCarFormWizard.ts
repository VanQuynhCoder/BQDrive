import { useState } from "react";
import toast from "react-hot-toast";

import type { CarFormStep } from "./CarFormWizard";
import {
  validateCarWizardStep,
  type CarWizardForm,
} from "./carFormWizard.model";

export function useCarFormWizard(scrollContainerId: string) {
  const [initialFormSnapshot, setInitialFormSnapshot] = useState("");
  const [currentStep, setCurrentStep] = useState<CarFormStep>(1);
  const [highestStep, setHighestStep] = useState<CarFormStep>(1);
  const [visitedSteps, setVisitedSteps] = useState<Set<CarFormStep>>(
    () => new Set([1]),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const initialize = (form: CarWizardForm) => {
    setInitialFormSnapshot(JSON.stringify(form));
    setCurrentStep(1);
    setHighestStep(1);
    setVisitedSteps(new Set([1]));
    setFieldErrors({});
  };

  const reset = () => {
    setInitialFormSnapshot("");
    setCurrentStep(1);
    setHighestStep(1);
    setVisitedSteps(new Set([1]));
    setFieldErrors({});
  };

  const clearFieldError = (field: keyof CarWizardForm) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const goToStep = (step: CarFormStep, scrollToTop = true) => {
    setCurrentStep(step);
    setHighestStep((prev) => Math.max(prev, step) as CarFormStep);
    setVisitedSteps((prev) => new Set(prev).add(step));

    if (scrollToTop) {
      window.setTimeout(() => {
        document
          .getElementById(scrollContainerId)
          ?.scrollTo({ top: 0, behavior: "smooth" });
      }, 0);
    }
  };

  const validateStep = (
    form: CarWizardForm,
    step: CarFormStep,
    editingOdometer?: number | null,
    requireRegistrationCardImages = false,
  ) => {
    const errors = validateCarWizardStep(
      form,
      step,
      editingOdometer,
      requireRegistrationCardImages,
    );
    setFieldErrors(errors);

    const firstField = Object.keys(errors)[0];
    const firstError = firstField ? errors[firstField] : undefined;
    if (!firstError) return true;

    toast.error(firstError);
    window.setTimeout(() => {
      const field = document.querySelector(
        `[data-car-form-field="${firstField}"]`,
      );
      if (field) {
        field.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        document
          .getElementById(scrollContainerId)
          ?.scrollTo({ top: 0, behavior: "smooth" });
      }
    }, 0);
    return false;
  };

  const goToNextStep = (
    form: CarWizardForm,
    editingOdometer?: number | null,
    requireRegistrationCardImages = false,
  ) => {
    if (
      !validateStep(
        form,
        currentStep,
        editingOdometer,
        requireRegistrationCardImages,
      )
    ) {
      return false;
    }
    if (currentStep < 6) {
      goToStep((currentStep + 1) as CarFormStep);
    }
    return true;
  };

  const findFirstInvalidStep = (
    form: CarWizardForm,
    editingOdometer?: number | null,
    requireRegistrationCardImages = false,
  ) => {
    for (let step = 1; step <= 5; step += 1) {
      if (
        !validateStep(
          form,
          step as CarFormStep,
          editingOdometer,
          requireRegistrationCardImages,
        )
      ) {
        goToStep(step as CarFormStep, false);
        return step as CarFormStep;
      }
    }
    return null;
  };

  const isDirty = (form: CarWizardForm) =>
    initialFormSnapshot !== "" &&
    JSON.stringify(form) !== initialFormSnapshot;

  const canClose = (form: CarWizardForm, busy: boolean, force = false) => {
    if (!force && busy) return false;
    if (
      !force &&
      isDirty(form) &&
      !window.confirm("Thông tin chưa được lưu. Bạn có chắc muốn thoát?")
    ) {
      return false;
    }
    return true;
  };

  return {
    currentStep,
    highestStep,
    visitedSteps,
    fieldErrors,
    initialize,
    reset,
    clearFieldError,
    goToStep,
    goToNextStep,
    findFirstInvalidStep,
    isDirty,
    canClose,
  };
}
