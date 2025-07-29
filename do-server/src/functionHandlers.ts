import { FunctionHandler } from "./types";

const functions: FunctionHandler[] = [];

functions.push({
  schema: {
    name: "get_weather_from_coords",
    type: "function",
    description: "Get the current weather",
    parameters: {
      type: "object",
      properties: {
        latitude: {
          type: "number",
        },
        longitude: {
          type: "number",
        },
      },
      required: ["latitude", "longitude"],
    },
  },
  handler: async (args: { latitude: number; longitude: number }) => {
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${args.latitude}&longitude=${args.longitude}&current=temperature_2m,wind_speed_10m&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m`
    );
    const data = await response.json();
    const currentTemp = data.current?.temperature_2m;
    return JSON.stringify({ temp: currentTemp });
  },
});

functions.push({
  schema: {
    name: "fetch_prescription_status_for_rosie",
    type: "function",
    description: "Fetch prescription status for Rosie",
    parameters: {
      type: "object",
      properties: {
        patient: {
          type: "object",
          properties: {
            name: {
              enum: ["Rosie"],
              type: "string"
            },
            patient_type: {
              enum: ["animal"],
              type: "string"
            },
            species: {
              enum: ["dog"],
              type: "string"
            },
            medication: {
              type: "object",
              properties: {
                name: {
                  enum: ["Simparica-Trio"],
                  type: "string"
                },
                dosage: {
                  enum: ["30mg"],
                  type: "string"
                },
                dosage_form: {
                  enum: ["tablet"],
                  type: "string"
                },
                cost: {
                  enum: ["$100"],
                  type: "string"
                }
              }
            }
          }
        }
      }
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
      prescribing_location: "Forbin's Veterinary Clinic",
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