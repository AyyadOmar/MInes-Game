import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import App from "./App";

describe("App", () => {
  test("renders the game controls", () => {
    render(<App />);

    expect(screen.getByText("Mines & Bombs")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
    expect(screen.getByText(/Risk Meter/i)).toBeInTheDocument();
    expect(screen.getByText(/Balance: 100.00/i)).toBeInTheDocument();
  });

  test("shows reset after starting a round", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cash Out" })).toBeDisabled();
  });
});
