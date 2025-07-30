import { FunctionHandler } from "./types";

const functions: FunctionHandler[] = [];

functions.push({
  schema: {
    name: "fetch_prescription_status_for_rosie",
    type: "function",
    description: "Fetch prescription status for Rosie (demo patient)",
    parameters: {
      type: "object",
      properties: {},
      required: []
    }
  },
  handler: async (args: any) => {
    // Mock prescription data for Rosie
    const prescriptionData = {
      patient: "Rosie",
      patient_type: "animal",
      species: "dog",
      medication: "Simparica-Trio",
      dosage: "30mg",
      dosage_form: "tablet",
      cost: "$100",
      status: "Ready for pickup",
      prescribing_by: "Forbin's Veterinary Clinic",
      prescription_date: "2024-01-15",
      expiry_date: "2025-01-15",
      prescribing_vet: "Dr. Suzy Greenberg",
      refills_remaining: 3,
      note: "May give with treats"
    };
    
    return JSON.stringify(prescriptionData);
  },
});

export default functions; 