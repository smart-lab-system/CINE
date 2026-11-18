

// User function Template for Java

class Solution {
    public double medianOf2(int a[], int b[]) {
       int[] arr = new int[a.length + b.length];
       
       int i = 0, j = 0, idx = 0;
       
       // Merging two sorted arrays
       while (i < a.length && j < b.length) {
           if (a[i] < b[j]) {
               arr[idx++] = a[i++];
           } else {
               arr[idx++] = b[j++];
           }
       }

       // Copy remaining elements from a
       while (i < a.length) {
           arr[idx++] = a[i++];
       }

       // Copy remaining elements from b
       while (j < b.length) {
           arr[idx++] = b[j++];
       }

       // Finding the median
       int mid = arr.length / 2;
       
       if (arr.length % 2 == 0) {
           return (arr[mid - 1] + arr[mid]) / 2.0; // Average of middle two elements
       } else {
           return arr[mid]; // Single middle element
       }
    }
}    