export const toolTemplates = [
  {
    name: "get_weather",
    type: "function",
    description: "Get the current weather",
    parameters: {
      type: "object",
      properties: {
        location: { type: "string" },
      },
    },
  },
  {
    name: "ping_no_args",
    type: "function",
    description: "A simple ping tool with no arguments",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "fetch_prescription_status_for_rosie",
    type: "function",
    description: "Fetch prescription status for Rosie",
    parameters: {
    "type": "object",
    "properties": {
      "patient": {
        "type": "object",
        "properties": {
          "name": {
            "enum": ["Rosie"],
            "type": "string"
          },
          "medication": {
            "type": "object",
            "properties": {
              "name": {
                "enum": ["Simparica-Trio"],
                "type": "string"
              },
              "dosage": {
                "enum": ["30mg"],
                "type": "string"
              },
              "dosage_form": {
                "enum": ["tablet"],
                "type": "string"
              },
              "cost": {
                "enum": ["$100"],
                "type": "string"
              }
            }
          }
        }
      }
    }
  }
},
  {
    name: "get_patient_medication_info_by_name",
    type: "function",
    description: "Fetch patient medication information by patient name",
    parameters: {
    "type": "object",
    "properties": {
      "patient": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string"
          },
          "medication": {
            "type": "object",
            "properties": {
              "name": {
                "type": "string"
              },
              "dosage": {
                "type": "string"
              },
              "dosage_form": {
                "type": "string"
              },
              "cost": {
                "type": "string"
              }
            }
          }
        }
      }
    }
  }
},
  {
    name: "get_user_nested_args",
    type: "function",
    description: "Fetch user profile by nested identifier",
    parameters: {
      type: "object",
      properties: {
        user: {
          type: "object",
          properties: {
            id: { type: "string" },
            metadata: {
              type: "object",
              properties: {
                region: { type: "string" },
                role: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
  {
    name: "calculate_route_more_properties",
    type: "function",
    description: "Calculate travel route with multiple parameters",
    parameters: {
      type: "object",
      properties: {
        start: { type: "string" },
        end: { type: "string" },
        mode: { type: "string", enum: ["car", "bike", "walk"] },
        options: {
          type: "object",
          properties: {
            avoid_highways: { type: "boolean" },
            scenic_route: { type: "boolean" },
          },
        },
      },
    },
  },
];
