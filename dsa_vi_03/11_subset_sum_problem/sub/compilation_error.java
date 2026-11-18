

// User function Template for Java

class Solution {

    static boolean val = false;

    static void helper(ArrayList<Integer> list,int[] arr,int pos,int tar) {
        
        if (tar == 0) {
            val = true;
            return;
        }
        
        if (pos >= arr.length || tar < 0)
            return;

        

        list.add(arr[pos]);
        helper(list,arr,pos+1,tar - arr[pos]);
        list.remove(list.size() - 1);
        helper(list,arr,pos+1,tar);
    }

    static Boolean isSubsetSum(int arr[], int target) {
        val = false
        ArrayList<Integer> list = new ArrayList<>();
        helper(list,arr,0,target);
        return val;
    }
}