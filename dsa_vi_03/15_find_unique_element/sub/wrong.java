
class Solution {
    public int findUnique(int k, int[] arr) {
        // code here
        int n=arr.length;
        for(int i=0;i<n;i++)
        {
            int count=0;
            for(int j=0;j<n;j++)
            {
                if(arr[i]==arr[j])
                {
                    count++;
                }
            }
            if(count%3!=0)
            {
                return arr[i];
            }
        }
        return -1;
    }
}