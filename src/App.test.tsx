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
    expect(screen.getByText("Round Insights")).toBeInTheDocument();
    expect(screen.getByText("Session Stats")).toBeInTheDocument();
  });

  test("hides reset during an active round", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cash Out" })).toBeDisabled();
  });

  test("allows clearing numeric inputs while editing and restores a valid value on blur", () => {
    render(<App />);

    const bombsInput = screen.getByDisplayValue("3");
    fireEvent.change(bombsInput, { target: { value: "" } });
    expect(screen.getByDisplayValue("")).toBeInTheDocument();

    fireEvent.blur(bombsInput);
    expect(screen.getByDisplayValue("3")).toBeInTheDocument();
  });

  test("does not allow cashing out before making a move", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(screen.getByText(/Balance: 99.00/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cash Out" })).toBeDisabled();
  });
});
