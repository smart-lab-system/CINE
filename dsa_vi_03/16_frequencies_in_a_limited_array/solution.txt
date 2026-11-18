import java.util.*;

class Solution {
    // Function to count the frequency of all elements from 1 to N in the array.
    public void frequencyCount(int[] arr, int N, int P) {
        int i = 0;
        while (i < N) {
            // If this element is already processed, skip it
            if (arr[i] <= 0 || arr[i] > N || arr[i] > P) {
                i++;
                continue;
            }

            // Find index corresponding to this element
            // For example, index for 5 is 4
            int elementIndex = arr[i] - 1;

            // If the elementIndex has an element that is not processed yet,
            // store that element to arr[i] so that we don't lose anything.
            if (arr[elementIndex] > 0) {
                arr[i] = arr[elementIndex];

                // After storing arr[elementIndex], change it to store the initial count of 'arr[i]'
                arr[elementIndex] = -1;
            } else {
                // If this is NOT the first occurrence of arr[i], decrement its count.
                arr[elementIndex]--;

                // Initialize arr[i] as 0, meaning the element 'i+1' is not seen so far
                arr[i] = 0;
                i++;
            }
        }

        // Convert the counts to positive values
        for (i = 0; i < N; i++) {
            if (arr[i] < 0) {
                arr[i] = -arr[i];
            } else {
                arr[i] = 0;
            }
        }
    }
}