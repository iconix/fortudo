/**
 * @jest-environment jsdom
 */

// This file contains tests for localStorage operations in fortudo

import { saveTasks, loadTasks } from '../public/js/storage.js';
import { setupMockLocalStorage } from './test-utils.js';

// Mock localStorage
let mockLocalStorage;

beforeEach(() => {
  // Use the utility function to set up mock localStorage
  mockLocalStorage = setupMockLocalStorage();
});

// Clear mocks after each test
afterEach(() => {
  jest.clearAllMocks();
});

describe('Storage Functionality', () => {
  describe('saveTasks', () => {
    test('should save tasks to localStorage', () => {
      const tasks = [
        { description: 'Test Task 1', startTime: '09:00', endTime: '10:00', duration: 60, status: 'incomplete', editing: false, confirmingDelete: false },
        { description: 'Test Task 2', startTime: '10:00', endTime: '11:00', duration: 60, status: 'incomplete', editing: false, confirmingDelete: false },
      ];
      saveTasks(tasks);
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('tasks', JSON.stringify(tasks));
    });

    test('should overwrite existing tasks in localStorage', () => {
      const oldTasks = [{ description: 'Old Task', startTime: '08:00', endTime: '09:00', duration: 60, status: 'incomplete', editing: false, confirmingDelete: false }];
      saveTasks(oldTasks); // Save initial tasks

      const newTasks = [{ description: 'New Task', startTime: '10:00', endTime: '11:00', duration: 60, status: 'incomplete', editing: false, confirmingDelete: false }];
      saveTasks(newTasks); // Save new tasks, overwriting old ones

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('tasks', JSON.stringify(newTasks));
      // Ensure setItem was called twice (once for oldTasks, once for newTasks)
      expect(mockLocalStorage.setItem).toHaveBeenCalledTimes(2);
    });

    test('should save an empty array to localStorage', () => {
      const tasks = [];
      saveTasks(tasks);
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('tasks', JSON.stringify([]));
    });
  });

  describe('loadTasks', () => {
    test('should load tasks from localStorage', () => {
      const storedTasks = [
        { description: 'Stored Task 1', startTime: '09:00', endTime: '10:00', duration: 60, status: 'incomplete', editing: false, confirmingDelete: false },
        { description: 'Stored Task 2', startTime: '10:30', endTime: '11:30', duration: 60, status: 'completed', editing: false, confirmingDelete: false },
      ];
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(storedTasks));

      const loadedTasks = loadTasks();
      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('tasks');
      expect(loadedTasks).toEqual(storedTasks);
    });

    test('should return an empty array if no tasks are in localStorage', () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      const loadedTasks = loadTasks();
      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('tasks');
      expect(loadedTasks).toEqual([]);
    });

    test('should return an empty array if localStorage contains invalid JSON', () => {
      mockLocalStorage.getItem.mockReturnValue('invalid json');
      // JSON.parse will throw an error, loadTasks should catch it and return []
      // We can't directly test the catch block here without more complex mocking
      // of JSON.parse, but we expect it to behave like 'null' or empty.
      // For the purpose of this test, we assume it will behave like 'null' (empty array).
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const loadedTasks = loadTasks();
      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('tasks');
      expect(loadedTasks).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalled(); // Verify console.error was called
      consoleErrorSpy.mockRestore();
    });

     test('should return an empty array if localStorage tasks are empty string', () => {
      mockLocalStorage.getItem.mockReturnValue('');
      const loadedTasks = loadTasks();
      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('tasks');
      expect(loadedTasks).toEqual([]);
    });
  });
});