

// User function Template for Java
class Solution {
    int missingNumber(int arr[]) {
        int n = arr.length+1;
        
      int f = 0, g = 0;

        // XOR all numbers from 1 to n
        for (int i = 1; i <= n; i++) {
            f ^= i;
        }

        // XOR all numbers in the given array
        for (int num : arr) {
            g ^= num;
        }

        
        return f ^ g;
    }

    public static void main(String[] args) {
        int[] arr1 = {1, 2, 3, 5};
        System.out.println(arr1);
    }
}